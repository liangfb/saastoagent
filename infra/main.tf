provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

# Uncomment after running scripts/init-tf-backend.sh:
# terraform {
#   backend "s3" {
#     bucket         = "agentic-mesh-tf-state"
#     key            = "dev/terraform.tfstate"
#     region         = "us-west-2"
#     dynamodb_table = "agentic-mesh-tf-lock"
#     encrypt        = true
#   }
# }
