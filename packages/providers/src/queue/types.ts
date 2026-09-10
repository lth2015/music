export interface QueueMessage {
  /** Handle used to delete or extend visibility; opaque to the consumer. */
  receiptHandle: string;
  messageId: string;
  body: Record<string, unknown>;
  /** How many times this message has been delivered. Drives the DLQ decision. */
  receiveCount: number;
}

/**
 * Queue adapter with at-least-once semantics.
 *
 * Both implementations may deliver duplicates and may reorder (this is what
 * real SQS Standard does). Consumers therefore never rely on exactly-once
 * delivery — idempotency is enforced in the database (GEN-04).
 */
export interface QueueAdapter {
  readonly kind: string;
  send(params: { body: Record<string, unknown>; delaySeconds?: number }): Promise<{ messageId: string }>;
  receive(params: { max: number; visibilityTimeoutSeconds: number; waitSeconds?: number }): Promise<QueueMessage[]>;
  deleteMessage(receiptHandle: string): Promise<void>;
  /** Extends the visibility timeout while a long unit of work is still running. */
  changeVisibility(receiptHandle: string, visibilityTimeoutSeconds: number): Promise<void>;
  /** Moves a repeatedly-failing message out of the main queue. */
  deadLetter(receiptHandle: string, reason: string): Promise<void>;
}
