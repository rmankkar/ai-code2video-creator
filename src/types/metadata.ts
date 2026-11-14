/**
 * YouTube Shorts Metadata Types
 */

export interface YouTubeMetadata {
  /** Video title (max 100 chars) */
  title: string;

  /** Video description with hashtags */
  description: string;

  /** Comma-separated tags for YouTube tags box */
  tags: string;

  /** First/pinned comment */
  firstComment: string;

  /** Generation metadata */
  meta: {
    generatedAt: string;
    model: string;
    scriptTitle: string;
    topic: string;
  };
}

export interface MetadataGeneratorOptions {
  /** The script topic */
  topic: string;

  /** Script title from generated script */
  scriptTitle: string;

  /** Script scenes for context */
  scenes: Array<{
    narration: string;
    description: string;
  }>;

  /** Custom instructions for the generator */
  customPrompt?: string;

  /** Target audience (affects tone) */
  audience?: 'general' | 'gamers' | 'tech' | 'casual';

  /** Video duration in seconds */
  durationSeconds?: number;
}

export interface MetadataGeneratorResult {
  metadata: YouTubeMetadata;
  rawResponse: string;
}

// Validation constants
export const YOUTUBE_LIMITS = {
  TITLE_MAX: 100,
  DESCRIPTION_MAX: 5000,
  TAGS_MAX: 500,
  COMMENT_MAX: 10000,
} as const;