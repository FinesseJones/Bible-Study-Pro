-- Migration for Enhanced PDF Sync and Metadata (2026 Update)
-- Add fields for better PDF handling and auto-sync

-- Add extracted title (auto-extracted from PDF or filename)
ALTER TABLE pdfs ADD COLUMN extractedTitle varchar(255) NULL;

-- Add auto-categorization
ALTER TABLE pdfs ADD COLUMN category varchar(128) DEFAULT 'Unclassified';

-- Add thumbnail URL for PDF preview cards
ALTER TABLE pdfs ADD COLUMN thumbnailUrl varchar(512) NULL;

-- Add metadata JSON for extensibility (pages, dimensions, etc.)
ALTER TABLE pdfs ADD COLUMN metadata json NULL;

-- Add sync source to track where PDF came from
ALTER TABLE pdfs ADD COLUMN syncSource varchar(256) NULL;

-- Track last sync time for incremental syncing
ALTER TABLE pdfs ADD COLUMN lastSyncedAt timestamp NULL;

-- Create indexes for faster queries
CREATE INDEX idx_pdfs_category ON pdfs(category);
CREATE INDEX idx_pdfs_syncSource ON pdfs(syncSource);
CREATE INDEX idx_pdfs_extractedTitle ON pdfs(extractedTitle);
CREATE INDEX idx_pdfs_userId_category ON pdfs(userId, category);
