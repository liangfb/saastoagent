# ── EKS ─────────────────────────────────────────────
output "eks_cluster_name" {
  description = "EKS cluster name"
  value       = aws_eks_cluster.main.name
}

output "eks_cluster_endpoint" {
  description = "EKS cluster API endpoint"
  value       = aws_eks_cluster.main.endpoint
}

output "eks_update_kubeconfig_command" {
  description = "Command to update kubeconfig"
  value       = "aws eks update-kubeconfig --region ${var.aws_region} --name ${aws_eks_cluster.main.name}"
}

output "eks_oidc_issuer" {
  description = "EKS OIDC issuer URL"
  value       = aws_eks_cluster.main.identity[0].oidc[0].issuer
}

# ── RDS ─────────────────────────────────────────────
output "rds_endpoint" {
  description = "RDS PostgreSQL endpoint (host:port)"
  value       = aws_db_instance.main.endpoint
}

output "rds_host" {
  description = "RDS hostname"
  value       = aws_db_instance.main.address
}

output "rds_password" {
  description = "RDS master password"
  value       = random_password.rds.result
  sensitive   = true
}

output "rds_database_url" {
  description = "Full DATABASE_URL for backend"
  value       = "postgresql://${var.rds_username}:${random_password.rds.result}@${aws_db_instance.main.address}:5432/${var.rds_db_name}"
  sensitive   = true
}

# ── ElastiCache ─────────────────────────────────────
output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = aws_elasticache_cluster.main.cache_nodes[0].address
}

output "redis_url" {
  description = "Full REDIS_URL for backend"
  value       = "redis://${aws_elasticache_cluster.main.cache_nodes[0].address}:6379/0"
}

# ── OpenSearch ──────────────────────────────────────
output "opensearch_endpoint" {
  description = "OpenSearch domain endpoint"
  value       = aws_opensearch_domain.main.endpoint
}

output "opensearch_dashboard_endpoint" {
  description = "OpenSearch Dashboards endpoint"
  value       = aws_opensearch_domain.main.dashboard_endpoint
}

output "opensearch_password" {
  description = "OpenSearch admin password"
  value       = random_password.opensearch.result
  sensitive   = true
}

# ── ECR ─────────────────────────────────────────────
output "ecr_repository_urls" {
  description = "ECR repository URLs"
  value       = { for k, v in aws_ecr_repository.repos : k => v.repository_url }
}

# ── IAM (for ALB Controller Helm install) ───────────
output "alb_controller_role_arn" {
  description = "IAM role ARN for AWS Load Balancer Controller"
  value       = aws_iam_role.alb_controller.arn
}
