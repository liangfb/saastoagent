# ── ElastiCache Subnet Group ────────────────────────
resource "aws_elasticache_subnet_group" "main" {
  name       = "${local.name_prefix}-redis"
  subnet_ids = var.private_subnet_ids

  tags = { Name = "${local.name_prefix}-redis" }
}

# ── ElastiCache Redis ───────────────────────────────
resource "aws_elasticache_cluster" "main" {
  cluster_id      = local.name_prefix
  engine          = "redis"
  engine_version  = "7.1"
  node_type       = var.redis_node_type
  num_cache_nodes = 1
  port            = 6379

  subnet_group_name  = aws_elasticache_subnet_group.main.name
  security_group_ids = [aws_security_group.redis.id]

  tags = { Name = "${local.name_prefix}-redis" }
}
