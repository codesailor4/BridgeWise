import { Injectable, Logger } from '@nestjs/common';
import { deflate, inflate } from 'zlib';
import { promisify } from 'util';

const deflateAsync = promisify(deflate);
const inflateAsync = promisify(inflate);

export interface SorobanTransactionPayload {
  txHash?: string;
  contractId: string;
  method: string;
  args: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface CompressedPayload {
  data: string; // base64-encoded compressed bytes
  originalSize: number;
  compressedSize: number;
  algorithm: 'deflate';
}

export interface CompressionStats {
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  savedBytes: number;
}

@Injectable()
export class SorobanTransactionCompressor {
  private readonly logger = new Logger(SorobanTransactionCompressor.name);

  /**
   * Compress a Soroban transaction payload
   */
  async compress(payload: SorobanTransactionPayload): Promise<CompressedPayload> {
    const json = JSON.stringify(payload);
    const originalSize = Buffer.byteLength(json, 'utf8');

    const compressed = await deflateAsync(Buffer.from(json, 'utf8'));
    const compressedSize = compressed.length;

    this.logger.debug(
      `Compressed payload: ${originalSize} -> ${compressedSize} bytes (${Math.round((1 - compressedSize / originalSize) * 100)}% reduction)`,
    );

    return {
      data: compressed.toString('base64'),
      originalSize,
      compressedSize,
      algorithm: 'deflate',
    };
  }

  /**
   * Decompress a previously compressed payload
   */
  async decompress(compressed: CompressedPayload): Promise<SorobanTransactionPayload> {
    const buffer = Buffer.from(compressed.data, 'base64');
    const decompressed = await inflateAsync(buffer);
    const json = decompressed.toString('utf8');

    const payload = JSON.parse(json) as SorobanTransactionPayload;
    this.logger.debug(`Decompressed payload: ${compressed.compressedSize} -> ${decompressed.length} bytes`);

    return payload;
  }

  /**
   * Validate that a decompressed payload matches the original
   */
  async validate(original: SorobanTransactionPayload, compressed: CompressedPayload): Promise<boolean> {
    try {
      const decompressed = await this.decompress(compressed);
      return JSON.stringify(decompressed) === JSON.stringify(original);
    } catch {
      return false;
    }
  }

  /**
   * Get compression statistics for a payload
   */
  async getStats(payload: SorobanTransactionPayload): Promise<CompressionStats> {
    const compressed = await this.compress(payload);
    const { originalSize, compressedSize } = compressed;
    return {
      originalSize,
      compressedSize,
      compressionRatio: compressedSize / originalSize,
      savedBytes: originalSize - compressedSize,
    };
  }

  /**
   * Compress a batch of payloads
   */
  async compressBatch(payloads: SorobanTransactionPayload[]): Promise<CompressedPayload[]> {
    return Promise.all(payloads.map((p) => this.compress(p)));
  }

  /**
   * Decompress a batch of compressed payloads
   */
  async decompressBatch(payloads: CompressedPayload[]): Promise<SorobanTransactionPayload[]> {
    return Promise.all(payloads.map((p) => this.decompress(p)));
  }
}
