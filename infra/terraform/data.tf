/**
 * Data stores: RDS MySQL, the two S3 zones, SQS with a DLQ, and Cognito.
 */

# ------------------------------------------------------------------ RDS MySQL

resource "aws_db_subnet_group" "main" {
  name       = "${local.name}-db"
  subnet_ids = module.vpc.database_subnets
  tags       = local.tags
}

resource "aws_security_group" "database" {
  name        = "${local.name}-db"
  description = "MySQL from the application subnets only"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description = "MySQL from private subnets"
    from_port   = 3306
    to_port     = 3306
    protocol    = "tcp"
    cidr_blocks = module.vpc.private_subnets_cidr_blocks
  }

  tags = local.tags
}

resource "aws_db_parameter_group" "mysql" {
  name        = "${local.name}-mysql8"
  family      = "mysql8.0"
  description = "LOOPSCENE MySQL 8.0 parameters"

  # The licence-snapshot immutability trigger (SEC-08) cannot be created without
  # this unless the DB user holds SUPER, which RDS does not grant.
  parameter {
    name  = "log_bin_trust_function_creators"
    value = "1"
  }

  # Everything is stored in UTC; JST is applied at presentation time (§10).
  parameter {
    name  = "time_zone"
    value = "UTC"
  }

  # A silently truncated value in a ledger table would be a correctness bug, so
  # strict mode is mandatory.
  parameter {
    name  = "sql_mode"
    value = "STRICT_TRANS_TABLES,NO_ENGINE_SUBSTITUTION,ERROR_FOR_DIVISION_BY_ZERO"
  }

  # Credit contention resolves in milliseconds; a long wait means something is
  # wrong and should fail fast into the retry path rather than hold a request.
  parameter {
    name  = "innodb_lock_wait_timeout"
    value = "10"
  }

  parameter {
    name  = "character_set_server"
    value = "utf8mb4"
  }

  parameter {
    name  = "collation_server"
    value = "utf8mb4_0900_ai_ci"
  }

  lifecycle {
    create_before_destroy = true
  }

  tags = local.tags
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "db" {
  name                    = "${local.name}/database"
  recovery_window_in_days = var.environment == "production" ? 30 : 0
  tags                    = local.tags
}

resource "aws_secretsmanager_secret_version" "db" {
  secret_id = aws_secretsmanager_secret.db.id
  secret_string = jsonencode({
    username = "loopscene"
    password = random_password.db.result
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = aws_db_instance.main.db_name
    url      = "mysql://loopscene:${random_password.db.result}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}?ssl=true"
  })
}

resource "aws_db_instance" "main" {
  identifier     = local.name
  engine         = "mysql"
  engine_version = "8.0.40"
  instance_class = var.db_instance_class

  db_name  = "loopscene"
  username = "loopscene"
  password = random_password.db.result

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 4
  storage_type          = "gp3"
  storage_encrypted     = true

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]
  parameter_group_name   = aws_db_parameter_group.mysql.name
  publicly_accessible    = false

  # §4.2: production is Multi-AZ.
  multi_az = var.environment == "production"

  # §12.3: RPO target 15 minutes. PITR gives a much finer recovery point than
  # that; the target still has to be proven by a restore rehearsal before it can
  # be reported as met.
  backup_retention_period   = var.environment == "production" ? 14 : 3
  backup_window             = "17:00-18:00" # 02:00-03:00 JST
  maintenance_window        = "sun:18:30-sun:19:30"
  copy_tags_to_snapshot     = true
  deletion_protection       = var.environment == "production"
  skip_final_snapshot       = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${local.name}-final" : null

  performance_insights_enabled = var.environment == "production"
  monitoring_interval          = var.environment == "production" ? 60 : 0
  monitoring_role_arn          = var.environment == "production" ? aws_iam_role.rds_monitoring[0].arn : null

  enabled_cloudwatch_logs_exports = ["error", "slowquery"]
  auto_minor_version_upgrade      = true

  tags = local.tags
}

resource "aws_iam_role" "rds_monitoring" {
  count = var.environment == "production" ? 1 : 0
  name  = "${local.name}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "monitoring.rds.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  count      = var.environment == "production" ? 1 : 0
  role       = aws_iam_role.rds_monitoring[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ----------------------------------------------------------------- S3 buckets

/**
 * Two buckets, two access boundaries (§4.2 / SEC-04):
 *   - quarantine holds raw provider output and is never readable by the
 *     delivery path or by any signed user URL;
 *   - delivery holds verified masters and exports, served only via short-lived
 *     presigned URLs after an ownership check.
 */
resource "aws_s3_bucket" "quarantine" {
  bucket = "${local.name}-quarantine"
  tags   = local.tags
}

resource "aws_s3_bucket" "delivery" {
  bucket = "${local.name}-delivery"
  tags   = local.tags
}

resource "aws_s3_bucket_public_access_block" "quarantine" {
  bucket                  = aws_s3_bucket.quarantine.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_public_access_block" "delivery" {
  bucket                  = aws_s3_bucket.delivery.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "quarantine" {
  bucket = aws_s3_bucket.quarantine.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.media.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "delivery" {
  bucket = aws_s3_bucket.delivery.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.media.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "delivery" {
  bucket = aws_s3_bucket.delivery.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "quarantine" {
  bucket = aws_s3_bucket.quarantine.id

  rule {
    id     = "expire-raw-provider-output"
    status = "Enabled"
    filter {}

    # Raw upstream output is kept only long enough to investigate a failed
    # output check, then removed.
    expiration {
      days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 3
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "delivery" {
  bucket = aws_s3_bucket.delivery.id

  rule {
    id     = "clean-up-old-versions"
    status = "Enabled"
    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 3
    }
  }
}

# Refuse any request that is not TLS.
resource "aws_s3_bucket_policy" "delivery_tls_only" {
  bucket = aws_s3_bucket.delivery.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "DenyInsecureTransport"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource = [
        aws_s3_bucket.delivery.arn,
        "${aws_s3_bucket.delivery.arn}/*",
      ]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}

resource "aws_kms_key" "media" {
  description             = "${local.name} audio at rest"
  deletion_window_in_days = var.environment == "production" ? 30 : 7
  enable_key_rotation     = true
  tags                    = local.tags
}

resource "aws_kms_alias" "media" {
  name          = "alias/${local.name}-media"
  target_key_id = aws_kms_key.media.key_id
}

# ------------------------------------------------------------------------ SQS

/**
 * Standard queue: at-least-once delivery with possible duplicates and
 * reordering. The worker does not assume otherwise — idempotency is enforced in
 * the database (GEN-04).
 */
resource "aws_sqs_queue" "generation_dlq" {
  name                      = "${local.name}-generation-dlq"
  message_retention_seconds = 1209600 # 14 days, to allow investigation
  sqs_managed_sse_enabled   = true
  tags                      = local.tags
}

resource "aws_sqs_queue" "generation" {
  name = "${local.name}-generation"

  # Long enough for a slow upstream generation plus audio processing; the worker
  # extends visibility explicitly while it is still working.
  visibility_timeout_seconds = 120
  message_retention_seconds  = 345600 # 4 days
  receive_wait_time_seconds  = 10     # long polling
  sqs_managed_sse_enabled    = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.generation_dlq.arn
    # §12.3: a retry cap, so a persistent upstream fault surfaces rather than
    # being masked by endless redelivery.
    maxReceiveCount = 5
  })

  tags = local.tags
}

# -------------------------------------------------------------------- Cognito

resource "aws_cognito_user_pool" "main" {
  name = local.name

  # Email OTP: the user pool owns the challenge, and this API only ever
  # validates the resulting id token (SEC-02).
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # SES is required for production email volume and deliverability; the Cognito
  # default sender is rate-limited and unsuitable for real traffic.
  email_configuration {
    email_sending_account = var.ses_source_arn == "" ? "COGNITO_DEFAULT" : "DEVELOPER"
    source_arn            = var.ses_source_arn == "" ? null : var.ses_source_arn
    from_email_address    = var.ses_from_address == "" ? null : var.ses_from_address
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    require_uppercase                = true
    temporary_password_validity_days = 1
  }

  # SEC-03: administrators authenticate with MFA. The application's own role
  # model is separate and lives in the users table.
  mfa_configuration = "OPTIONAL"
  software_token_mfa_configuration {
    enabled = true
  }

  tags = local.tags
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${local.name}-web"
  user_pool_id = aws_cognito_user_pool.main.id

  # A public SPA client holds no secret.
  generate_secret = false

  explicit_auth_flows = [
    "ALLOW_USER_AUTH", # passwordless / email OTP
    "ALLOW_REFRESH_TOKEN_AUTH",
  ]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  prevent_user_existence_errors = "ENABLED"
  enable_token_revocation       = true

  callback_urls = var.web_callback_urls
  logout_urls   = var.web_callback_urls
}
