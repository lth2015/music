import {
  ChangeMessageVisibilityCommand,
  DeleteMessageCommand,
  ReceiveMessageCommand,
  SQSClient,
  SendMessageCommand,
} from '@aws-sdk/client-sqs';
import type { QueueAdapter, QueueMessage } from './types.js';

export interface SqsOptions {
  region: string;
  queueUrl: string;
  maxReceiveCount?: number;
}

/**
 * SQS Standard adapter. At-least-once delivery with possible duplicates and
 * reordering is expected and handled downstream by database idempotency
 * (GEN-04). Redrive to a DLQ is configured on the queue itself in Terraform;
 * `deadLetter` here just stops re-processing on this consumer's side by letting
 * the message become visible again for the redrive policy to take over.
 */
export class SqsQueueAdapter implements QueueAdapter {
  readonly kind = 'sqs';
  private readonly client: SQSClient;
  private readonly queueUrl: string;

  constructor(opts: SqsOptions) {
    this.client = new SQSClient({ region: opts.region });
    this.queueUrl = opts.queueUrl;
  }

  async send(params: { body: Record<string, unknown>; delaySeconds?: number }): Promise<{ messageId: string }> {
    const res = await this.client.send(
      new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(params.body),
        DelaySeconds: params.delaySeconds ?? 0,
      }),
    );
    return { messageId: res.MessageId ?? '' };
  }

  async receive(params: {
    max: number;
    visibilityTimeoutSeconds: number;
    waitSeconds?: number;
  }): Promise<QueueMessage[]> {
    const res = await this.client.send(
      new ReceiveMessageCommand({
        QueueUrl: this.queueUrl,
        MaxNumberOfMessages: Math.min(params.max, 10),
        VisibilityTimeout: params.visibilityTimeoutSeconds,
        WaitTimeSeconds: params.waitSeconds ?? 10,
        MessageSystemAttributeNames: ['ApproximateReceiveCount'],
      }),
    );
    return (res.Messages ?? []).map((m) => ({
      messageId: m.MessageId ?? '',
      receiptHandle: m.ReceiptHandle ?? '',
      body: JSON.parse(m.Body ?? '{}') as Record<string, unknown>,
      receiveCount: Number(m.Attributes?.['ApproximateReceiveCount'] ?? '1'),
    }));
  }

  async deleteMessage(receiptHandle: string): Promise<void> {
    await this.client.send(new DeleteMessageCommand({ QueueUrl: this.queueUrl, ReceiptHandle: receiptHandle }));
  }

  async changeVisibility(receiptHandle: string, visibilityTimeoutSeconds: number): Promise<void> {
    await this.client.send(
      new ChangeMessageVisibilityCommand({
        QueueUrl: this.queueUrl,
        ReceiptHandle: receiptHandle,
        VisibilityTimeout: visibilityTimeoutSeconds,
      }),
    );
  }

  async deadLetter(receiptHandle: string, _reason: string): Promise<void> {
    // Let the queue's own redrive policy move it: making the message visible
    // again increments the receive count until maxReceiveCount is hit.
    await this.changeVisibility(receiptHandle, 0);
  }
}
