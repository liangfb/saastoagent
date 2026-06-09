# ── OpenSearch Service-Linked Role ──────────────────
# This role is created once per AWS account. If it already exists, this will fail gracefully.
resource "aws_iam_service_linked_role" "opensearch" {
  aws_service_name = "es.amazonaws.com"
  count            = 0 # Set to 1 if you haven't created this role before in this account
}

# ── OpenSearch Domain ───────────────────────────────
resource "aws_opensearch_domain" "main" {
  domain_name    = local.name_prefix
  engine_version = "OpenSearch_2.13"

  cluster_config {
    instance_type  = var.opensearch_instance_type
    instance_count = 1

    zone_awareness_enabled = false
  }

  ebs_options {
    ebs_enabled = true
    volume_type = "gp3"
    volume_size = var.opensearch_volume_size
  }

  vpc_options {
    subnet_ids         = [var.private_subnet_ids[0]]
    security_group_ids = [aws_security_group.opensearch.id]
  }

  encrypt_at_rest {
    enabled = true
  }

  node_to_node_encryption {
    enabled = true
  }

  domain_endpoint_options {
    enforce_https       = true
    tls_security_policy = "Policy-Min-TLS-1-2-2019-07"
  }

  advanced_security_options {
    enabled                        = true
    internal_user_database_enabled = true

    master_user_options {
      master_user_name     = "admin"
      master_user_password = random_password.opensearch.result
    }
  }

  access_policies = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { AWS = "*" }
      Action    = "es:*"
      Resource  = "arn:aws:es:${var.aws_region}:${data.aws_caller_identity.current.account_id}:domain/${local.name_prefix}/*"
    }]
  })

  tags = { Name = "${local.name_prefix}-opensearch" }
}

resource "random_password" "opensearch" {
  length           = 24
  special          = true
  override_special = "!@#$%^&*"
  min_upper        = 1
  min_lower        = 1
  min_numeric      = 1
  min_special      = 1
}
