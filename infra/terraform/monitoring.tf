/**
 * Alarms for the conditions PROJECT_TASK.md §12.3 names: queue age, upstream
 * failure rate, budget consumption, webhook backlog and ledger discrepancies.
 *
 * The last three are emitted by the application as custom metrics, so the
 * worker's `maintenanceLoop` must be running for those alarms to have data — an
 * alarm on a metric nothing publishes is worse than no alarm, because it looks
 * healthy. Each of those has `treat_missing_data = "breaching"` for that reason.
 */

resource "aws_sns_topic" "alerts" {
  name = "${local.name}-alerts"
  tags = local.tags
}

resource "aws_sns_topic_subscription" "alerts_email" {
  count     = var.alert_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

locals {
  alarm_actions = [aws_sns_topic.alerts.arn]
  metric_ns     = "LOOPSCENE/${var.environment}"
}

# ------------------------------------------------------------------- queueing

resource "aws_cloudwatch_metric_alarm" "queue_age" {
  alarm_name         = "${local.name}-queue-age"
  alarm_description  = "Generation queue backlog is ageing; users are waiting."
  namespace          = "AWS/SQS"
  metric_name        = "ApproximateAgeOfOldestMessage"
  dimensions         = { QueueName = aws_sqs_queue.generation.name }
  statistic          = "Maximum"
  period             = 60
  evaluation_periods = 3
  # §12.3: the UI warns the user at 3 minutes, so the operator should already
  # know by then.
  threshold           = 180
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  ok_actions          = local.alarm_actions
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "dlq_not_empty" {
  alarm_name          = "${local.name}-dlq-not-empty"
  alarm_description   = "Messages reached the DLQ: a job failed every retry."
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  dimensions          = { QueueName = aws_sqs_queue.generation_dlq.name }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  tags                = local.tags
}

# ------------------------------------------------------------------- database

resource "aws_cloudwatch_metric_alarm" "db_cpu" {
  alarm_name          = "${local.name}-db-cpu"
  alarm_description   = "RDS CPU sustained high."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.id }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "db_storage" {
  alarm_name          = "${local.name}-db-free-storage"
  alarm_description   = "RDS free storage is low."
  namespace           = "AWS/RDS"
  metric_name         = "FreeStorageSpace"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.main.id }
  statistic           = "Minimum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 5 * 1024 * 1024 * 1024
  comparison_operator = "LessThanThreshold"
  alarm_actions       = local.alarm_actions
  tags                = local.tags
}

# ------------------------------------------- application-published conditions

resource "aws_cloudwatch_metric_alarm" "upstream_failure_rate" {
  alarm_name          = "${local.name}-upstream-failure-rate"
  alarm_description   = "Upstream generation failure rate above the §12.3 target (>5%)."
  namespace           = local.metric_ns
  metric_name         = "UpstreamFailureRate"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 0.05
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "breaching"
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "daily_budget" {
  alarm_name          = "${local.name}-daily-budget"
  alarm_description   = "Daily upstream spend approaching the configured cap; new generation pauses at 100%."
  namespace           = local.metric_ns
  metric_name         = "DailyBudgetConsumedRatio"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0.8
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "breaching"
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "webhook_backlog" {
  alarm_name          = "${local.name}-webhook-backlog"
  alarm_description   = "Stripe webhooks are queued unprocessed; entitlements may be delayed."
  namespace           = local.metric_ns
  metric_name         = "WebhookBacklog"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 20
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "breaching"
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "ledger_discrepancy" {
  alarm_name         = "${local.name}-ledger-discrepancy"
  alarm_description  = "Credit ledger counters disagree with the append-only entries. Investigate; do not auto-correct."
  namespace          = local.metric_ns
  metric_name        = "LedgerDiscrepancies"
  statistic          = "Maximum"
  period             = 300
  evaluation_periods = 1
  # Any discrepancy at all is a defect.
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "breaching"
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "ungranted_paid_orders" {
  alarm_name          = "${local.name}-ungranted-paid-orders"
  alarm_description   = "Orders were charged but the entitlement never landed (PAY-11)."
  namespace           = local.metric_ns
  metric_name         = "UngrantedPaidOrders"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "breaching"
  tags                = local.tags
}

resource "aws_cloudwatch_metric_alarm" "stale_unknown_jobs" {
  alarm_name          = "${local.name}-stale-unknown-jobs"
  alarm_description   = "Jobs stuck in verification past the 15-minute window (§12.3)."
  namespace           = local.metric_ns
  metric_name         = "StaleUnknownJobs"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  alarm_actions       = local.alarm_actions
  treat_missing_data  = "breaching"
  tags                = local.tags
}

resource "aws_cloudwatch_log_group" "app" {
  name              = "/loopscene/${var.environment}/app"
  retention_in_days = var.environment == "production" ? 90 : 14
  kms_key_id        = aws_kms_key.media.arn
  tags              = local.tags
}
