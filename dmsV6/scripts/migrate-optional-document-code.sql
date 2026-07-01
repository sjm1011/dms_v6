BEGIN;

ALTER TABLE dms_doc
ALTER COLUMN dd_code DROP NOT NULL;

UPDATE dms_doc
   SET dd_code = NULLIF(UPPER(BTRIM(dd_code)), '');

DROP INDEX IF EXISTS uq_dms_doc_code;

CREATE UNIQUE INDEX uq_dms_doc_code
ON dms_doc(dd_code)
WHERE dd_code IS NOT NULL;

UPDATE dms_doc_ver
   SET ddv_no = NULLIF(UPPER(BTRIM(ddv_no)), '');

DROP INDEX IF EXISTS uq_dms_doc_ver_no;

CREATE UNIQUE INDEX uq_dms_doc_ver_no
ON dms_doc_ver(dd_id, ddv_no)
WHERE ddv_no IS NOT NULL;

COMMIT;
