"""
mem0 Self-Hosted REST API Server

Wraps the mem0 Python SDK in a FastAPI server to expose
REST endpoints for the NestJS backend to consume.

Configuration via environment variables:
  MEM0_VECTOR_STORE__PROVIDER       (default: opensearch)
  Vector store — OpenSearch (provider=opensearch):
    MEM0_VECTOR_STORE__CONFIG__HOST            (OpenSearch domain host, no scheme)
    MEM0_VECTOR_STORE__CONFIG__PORT            (default: 443)
    MEM0_VECTOR_STORE__CONFIG__USER            (default: admin)
    MEM0_VECTOR_STORE__CONFIG__PASSWORD        (OpenSearch master password)
  Vector store — Qdrant (provider=qdrant, legacy):
    MEM0_VECTOR_STORE__CONFIG__URL             (default: http://localhost:6333)
  Common:
    MEM0_VECTOR_STORE__CONFIG__COLLECTION_NAME (default: agent_memories)
    MEM0_VECTOR_STORE__CONFIG__EMBEDDING_MODEL_DIMS (default: 1024)
  MEM0_LLM__PROVIDER               (default: openai)
  MEM0_LLM__CONFIG__MODEL           (default: gpt-4o-mini)
  MEM0_EMBEDDER__PROVIDER           (default: openai)
  MEM0_EMBEDDER__CONFIG__MODEL      (embedder model id, e.g. amazon.titan-embed-text-v2:0)
  MEM0_EMBEDDER__CONFIG__AWS_REGION (AWS region for aws_bedrock embedder)
  OPENAI_API_KEY                    (required when LLM/embedder provider is openai)
  AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY (required for aws_bedrock provider)
"""

import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from mem0 import Memory

# --- Configuration ---

def build_mem0_config() -> dict:
    """Build mem0 config from environment variables."""
    embedder_config: dict = {}
    embedder_model = os.getenv("MEM0_EMBEDDER__CONFIG__MODEL")
    if embedder_model:
        embedder_config["model"] = embedder_model
    embedder_region = os.getenv("MEM0_EMBEDDER__CONFIG__AWS_REGION")
    if embedder_region:
        embedder_config["aws_region"] = embedder_region

    llm_config: dict = {"model": os.getenv("MEM0_LLM__CONFIG__MODEL", "gpt-4o-mini")}
    llm_region = os.getenv("MEM0_LLM__CONFIG__AWS_REGION")
    if llm_region:
        llm_config["aws_region"] = llm_region

    vector_provider = os.getenv("MEM0_VECTOR_STORE__PROVIDER", "opensearch")
    collection_name = os.getenv(
        "MEM0_VECTOR_STORE__CONFIG__COLLECTION_NAME", "agent_memories"
    )
    embedding_dims = int(
        os.getenv("MEM0_VECTOR_STORE__CONFIG__EMBEDDING_MODEL_DIMS", "1024")
    )

    if vector_provider == "opensearch":
        # AWS OpenSearch domain (HTTPS, internal user database auth).
        vector_config: dict = {
            "collection_name": collection_name,
            "host": os.getenv("MEM0_VECTOR_STORE__CONFIG__HOST", "localhost"),
            "port": int(os.getenv("MEM0_VECTOR_STORE__CONFIG__PORT", "443")),
            "user": os.getenv("MEM0_VECTOR_STORE__CONFIG__USER", "admin"),
            "password": os.getenv("MEM0_VECTOR_STORE__CONFIG__PASSWORD", ""),
            "embedding_model_dims": embedding_dims,
            "use_ssl": True,
            "verify_certs": True,
        }
    else:
        # Legacy Qdrant support.
        vector_config = {
            "url": os.getenv(
                "MEM0_VECTOR_STORE__CONFIG__URL", "http://localhost:6333"
            ),
            "collection_name": collection_name,
            "embedding_model_dims": embedding_dims,
        }

    return {
        "vector_store": {
            "provider": vector_provider,
            "config": vector_config,
        },
        "llm": {
            "provider": os.getenv("MEM0_LLM__PROVIDER", "openai"),
            "config": llm_config,
        },
        "embedder": {
            "provider": os.getenv("MEM0_EMBEDDER__PROVIDER", "openai"),
            "config": embedder_config,
        },
    }


app = FastAPI(
    title="mem0 Agent Memory Server",
    description="Self-hosted mem0 REST API for Agentic Service Mesh",
    version="1.0.0",
)

memory: Optional[Memory] = None


@app.on_event("startup")
def startup():
    global memory
    config = build_mem0_config()
    memory = Memory.from_config(config)


# --- Request/Response Models ---

class AddMemoryRequest(BaseModel):
    messages: list[dict]
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    run_id: Optional[str] = None
    metadata: Optional[dict] = None


class SearchMemoryRequest(BaseModel):
    query: str
    user_id: Optional[str] = None
    agent_id: Optional[str] = None
    run_id: Optional[str] = None
    limit: int = 20


class UpdateMemoryRequest(BaseModel):
    text: Optional[str] = None
    metadata: Optional[dict] = None


class DeleteAllRequest(BaseModel):
    user_id: Optional[str] = None
    agent_id: Optional[str] = None


# --- Health Check ---

@app.get("/health")
def health():
    return {"status": "ok"}


# --- Memory Endpoints ---

@app.post("/api/v1/memories/")
def add_memory(req: AddMemoryRequest):
    kwargs = {}
    if req.user_id:
        kwargs["user_id"] = req.user_id
    if req.agent_id:
        kwargs["agent_id"] = req.agent_id
    if req.run_id:
        kwargs["run_id"] = req.run_id
    if req.metadata:
        kwargs["metadata"] = req.metadata

    result = memory.add(req.messages, **kwargs)
    return {"results": result.get("results", []) if isinstance(result, dict) else result}


def _build_filters(
    user_id: Optional[str] = None,
    agent_id: Optional[str] = None,
    run_id: Optional[str] = None,
) -> dict:
    """mem0 >=2.0 requires entity scoping via filters={...} for search/get_all."""
    filters: dict = {}
    if user_id:
        filters["user_id"] = user_id
    if agent_id:
        filters["agent_id"] = agent_id
    if run_id:
        filters["run_id"] = run_id
    return filters


@app.post("/api/v1/memories/search/")
def search_memories(req: SearchMemoryRequest):
    filters = _build_filters(req.user_id, req.agent_id, req.run_id)
    results = memory.search(req.query, top_k=req.limit, filters=filters)
    if isinstance(results, dict):
        items = results.get("results", [])
    else:
        items = results

    return {"results": items[:req.limit]}


@app.get("/api/v1/memories/")
def list_memories(user_id: Optional[str] = None, agent_id: Optional[str] = None):
    filters = _build_filters(user_id, agent_id)
    results = memory.get_all(filters=filters)
    if isinstance(results, dict):
        items = results.get("results", [])
    else:
        items = results

    return {"results": items}


@app.get("/api/v1/memories/{memory_id}/")
def get_memory(memory_id: str):
    result = memory.get(memory_id)
    if not result:
        raise HTTPException(status_code=404, detail="Memory not found")
    return result


@app.put("/api/v1/memories/{memory_id}/")
def update_memory(memory_id: str, req: UpdateMemoryRequest):
    kwargs = {}
    if req.text is not None:
        kwargs["text"] = req.text
    if req.metadata is not None:
        kwargs["metadata"] = req.metadata

    if not kwargs:
        raise HTTPException(status_code=400, detail="At least one of text or metadata required")

    result = memory.update(memory_id, **kwargs)
    return result


@app.delete("/api/v1/memories/{memory_id}/")
def delete_memory(memory_id: str):
    memory.delete(memory_id)
    return {"status": "deleted"}


@app.delete("/api/v1/memories/")
def delete_all_memories(user_id: Optional[str] = None, agent_id: Optional[str] = None):
    kwargs = {}
    if user_id:
        kwargs["user_id"] = user_id
    if agent_id:
        kwargs["agent_id"] = agent_id

    memory.delete_all(**kwargs)
    return {"status": "deleted"}


@app.get("/api/v1/memories/{memory_id}/history/")
def memory_history(memory_id: str):
    result = memory.history(memory_id)
    return result if result else []
