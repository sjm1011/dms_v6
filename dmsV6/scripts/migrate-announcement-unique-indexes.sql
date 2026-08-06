BEGIN;

LOCK TABLE dms_ann IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE dms_ann_read IN SHARE ROW EXCLUSIVE MODE;

DO $do$
DECLARE
  duplicate_ids TEXT;
BEGIN
  SELECT STRING_AGG(dan_id::text, ', ' ORDER BY dan_id)
    INTO duplicate_ids
    FROM (
      SELECT dan_id
        FROM dms_ann
       GROUP BY dan_id
      HAVING COUNT(*) > 1
    ) duplicated;

  IF duplicate_ids IS NOT NULL THEN
    RAISE EXCEPTION 'dms_ann.dan_id 存在重複值：%', duplicate_ids;
  END IF;

  SELECT STRING_AGG(danr_id::text, ', ' ORDER BY danr_id)
    INTO duplicate_ids
    FROM (
      SELECT danr_id
        FROM dms_ann_read
       GROUP BY danr_id
      HAVING COUNT(*) > 1
    ) duplicated;

  IF duplicate_ids IS NOT NULL THEN
    RAISE EXCEPTION 'dms_ann_read.danr_id 存在重複值：%', duplicate_ids;
  END IF;
END
$do$;

SELECT SETVAL(
         PG_GET_SERIAL_SEQUENCE('dms_ann', 'dan_id'),
         COALESCE(MAX(dan_id), 1),
         COUNT(*) > 0
       )
  FROM dms_ann;

SELECT SETVAL(
         PG_GET_SERIAL_SEQUENCE('dms_ann_read', 'danr_id'),
         COALESCE(MAX(danr_id), 1),
         COUNT(*) > 0
       )
  FROM dms_ann_read;

CREATE UNIQUE INDEX IF NOT EXISTS uidx_dms_ann_id
ON dms_ann(dan_id);

CREATE UNIQUE INDEX IF NOT EXISTS uidx_dms_ann_read_id
ON dms_ann_read(danr_id);

COMMIT;
