/**
 * LOOPSCENE — AWS infrastructure (Tokyo).
 *
 * PROJECT_TASK.md §4.2 and §12.3. This configuration is written to be
 * reviewable and `terraform plan`-able, but it has NOT been applied: no AWS
 * account has been authorised for this project. docs/OPEN_ITEMS.md records that
 * as BLOCKED_EXTERNAL rather than claiming a deployment happened.
 *
 * Two deliberate deviations from the source spec:
 *   - RDS is MySQL 8.0, not PostgreSQL. The spec text says PostgreSQL; the
 *     actual target is a MySQL-compatible RDS.
 *   - `log_bin_trust_function_creators` is enabled in the parameter group,
 *     which the licence-immutability trigger requires (SEC-08).
 */

terraform {
  required_version = ">= 1.8.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.80"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Configure a versioned S3 backend with DynamoDB locking before first use.
  # backend "s3" {}
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "loopscene"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name = "loopscene-${var.environment}"
  # API and RDS both need at least two AZs: the API runs two replicas across
  # zones and RDS is Multi-AZ (§4.2).
  azs = slice(data.aws_availability_zones.available.names, 0, 2)

  tags = {
    Project     = "loopscene"
    Environment = var.environment
  }
}

# --------------------------------------------------------------------- network

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.16"

  name = local.name
  cidr = var.vpc_cidr
  azs  = local.azs

  public_subnets   = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 4, i)]
  private_subnets  = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 4, i + 4)]
  database_subnets = [for i, _ in local.azs : cidrsubnet(var.vpc_cidr, 4, i + 8)]

  # The API, the worker and the database all live in private subnets; only the
  # load balancer is public (§4.2).
  enable_nat_gateway     = true
  single_nat_gateway     = var.environment != "production"
  one_nat_gateway_per_az = var.environment == "production"

  enable_dns_hostnames = true
  enable_dns_support   = true

  create_database_subnet_group = true

  public_subnet_tags  = { "kubernetes.io/role/elb" = 1 }
  private_subnet_tags = { "kubernetes.io/role/internal-elb" = 1 }

  tags = local.tags
}

# VPC endpoints keep S3 and SQS traffic off the public internet, which also
# reduces NAT cost.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = module.vpc.vpc_id
  service_name      = "com.amazonaws.${var.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = module.vpc.private_route_table_ids
  tags              = local.tags
}

resource "aws_vpc_endpoint" "sqs" {
  vpc_id              = module.vpc.vpc_id
  service_name        = "com.amazonaws.${var.region}.sqs"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = module.vpc.private_subnets
  security_group_ids  = [aws_security_group.vpc_endpoints.id]
  private_dns_enabled = true
  tags                = local.tags
}

resource "aws_security_group" "vpc_endpoints" {
  name        = "${local.name}-vpce"
  description = "HTTPS from inside the VPC to interface endpoints"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "HTTPS from the VPC"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [module.vpc.vpc_cidr_block]
  }

  tags = local.tags
}
