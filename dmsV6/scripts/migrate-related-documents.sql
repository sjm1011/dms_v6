ALTER TABLE dms_doc
ADD COLUMN IF NOT EXISTS dd_parent_id INTEGER;

CREATE INDEX IF NOT EXISTS idx_dms_doc_parent
ON dms_doc(dd_parent_id);

COMMENT ON COLUMN dms_doc.dd_parent_id IS '主文件識別碼；空白代表第一階文件';
