ALTER TABLE dms_doc
ADD COLUMN IF NOT EXISTS dd_security_level SMALLINT NOT NULL DEFAULT 1;

UPDATE dms_doc child
   SET dd_security_level = parent.dd_security_level,
       dd_updat = CURRENT_TIMESTAMP
  FROM dms_doc parent
 WHERE child.dd_parent_id = parent.dd_id
   AND child.dd_security_level <> parent.dd_security_level;

COMMENT ON COLUMN dms_doc.dd_security_level
IS '文件機敏等級。1：一般，2：敏感，3：機密；相關文件繼承主文件';
