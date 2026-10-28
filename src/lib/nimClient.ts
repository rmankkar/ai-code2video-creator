/**
 * NVIDIA NIM Client
 * OpenAI-compatible API client for NVIDIA NIM LLM inference
 *
 * API Docs: https://docs.nvidia.com/nim/large-language-models/latest/api-reference.html
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';

// Load .env file manually (no dotenv dependency)
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env');
    const content = readFileSync(envPath, 'utf-8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          process.env[key.trim()] = valueParts.join('=').trim();
        }
      }
    });
  } catch {
    // .env file not found, use process.env directly
  }
}

loadEnv();

export interface NIMConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
}

export interface NIMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface NIMRequest {
  model: string;
  messages: NIMMessage[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' };
  stream?: boolean;
}

export interface NIMResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface NIMError {
  error: {
    message: string;
    type: string;
    code?: string;
  };
}

function getConfig(): NIMConfig {
  const baseUrl = process.env.NVIDIA_NIM_BASE_URL;
  const model = process.env.NVIDIA_NIM_MODEL;
  const apiKey = process.env.NVIDIA_NIM_API_KEY;

  if (!baseUrl) throw new Error('NVIDIA_NIM_BASE_URL not set in .env');
  if (!model) throw new Error('NVIDIA_NIM_MODEL not set in .env');
  if (!apiKey || apiKey === 'your_nvapi_key_here') {
    throw new Error('NVIDIA_NIM_API_KEY not set in .env (copy .env.example to .env and add your key)');
  }

  return { baseUrl, model, apiKey };
}

export class NIMClient {
  private config: NIMConfig;
  private maxRetries = 3;
  private baseDelay = 1000; // 1 second

  constructor(config?: Partial<NIMConfig>) {
    this.config = config ? { ...getConfig(), ...config } : getConfig();
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private calculateDelay(attempt: number): number {
    // Use deterministic random based on attempt for consistent retry delays
    const pseudoRandom = ((attempt * 9301 + 49297) % 233280) / 233280;
    return this.baseDelay * Math.pow(2, attempt) + pseudoRandom * 1000;
  }

  async chatCompletion(request: Omit<NIMRequest, 'model'>): Promise<NIMResponse> {
    const url = `${this.config.baseUrl}/chat/completions`;
    const body: NIMRequest = {
      model: this.config.model,
      ...request,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          const errorData: NIMError = await response.json().catch(() => ({
            error: { message: `HTTP ${response.status}: ${response.statusText}`, type: 'http_error' }
          }));

          const error: Error & { status?: number; type?: string } = new Error(`NIM API Error: ${errorData.error.message}`);
          error.status = response.status;
          error.type = errorData.error.type;

          // Don't retry on auth errors or invalid requests
          if (response.status === 401 || response.status === 403) {
            throw new Error('Invalid API key. Check NVIDIA_NIM_API_KEY in .env');
          }
          if (response.status === 404) {
            throw new Error(`Model not found: ${this.config.model}. Check NVIDIA_NIM_MODEL in .env`);
          }
          if (response.status === 422) {
            throw new Error(`Invalid request: ${errorData.error.message}`);
          }

          throw error;
        }

        const data: NIMResponse = await response.json();
        return data;

      } catch (error) {
        lastError = error as Error;

        // Don't retry on certain errors
        const err = error as Error & { status?: number };
        if (err.status === 401 || err.status === 403 || err.status === 404 || err.status === 422) {
          throw error;
        }

        // Retry on network errors, 429, 5xx
        if (attempt < this.maxRetries) {
          const delay = this.calculateDelay(attempt);
          console.log(`⚠️  NIM request failed (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${Math.round(delay)}ms...`);
          console.log(`   Error: ${lastError.message}`);
          await this.sleep(delay);
          continue;
        }
      }
    }

    throw new Error(`NIM request failed after ${this.maxRetries + 1} attempts: ${lastError?.message}`);
  }

  async generateStructuredOutput<T>(systemPrompt: string, userPrompt: string): Promise<T> {
    const messages: NIMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    const request: Omit<NIMRequest, 'model'> = {
      messages,
      temperature: 0.7,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
    };

    const response = await this.chatCompletion(request);

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Empty response from NIM');
    }

    try {
      const parsed = JSON.parse(content);
      return parsed as T;
    } catch (parseError) {
      throw new Error(`Failed to parse JSON response: ${parseError}. Raw: ${content.slice(0, 500)}`);
    }
  }
}

// Singleton instance
let nimClientInstance: NIMClient | null = null;

export function getNIMClient(): NIMClient {
  if (!nimClientInstance) {
    nimClientInstance = new NIMClient();
  }
  return nimClientInstance;
}