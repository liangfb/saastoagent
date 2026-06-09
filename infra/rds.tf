# ── RDS Subnet Group ────────────────────────────────
resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-rds"
  subnet_ids = var.private_subnet_ids

  tags = { Name = "${local.name_prefix}-rds" }
}

# ── Random Password ─────────────────────────────────
resource "random_password" "rds" {
  length  = 24
  special = false
}

# ── RDS Instance ────────────────────────────────────
resource "aws_db_instance" "main" {
  identifier     = local.name_prefix
  engine         = "postgres"
  engine_version = "16"
  instance_class = var.rds_instance_class

  allocated_storage = var.rds_allocated_storage
  storage_type      = "gp3"

  db_name  = var.rds_db_name
  username = var.rds_username
  password = random_password.rds.result

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.rds.id]

  multi_az            = false
  publicly_accessible = false

  backup_retention_period = 1
  skip_final_snapshot     = true
  deletion_protection     = false

  tags = { Name = "${local.name_prefix}-rds" }
}
