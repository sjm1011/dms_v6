import { query } from './db';

interface VersionAccessCountRow {
  version_id: number;
  access_count: string | number;
}

export const getVersionAccessCounts = async (
  versionIds: number[]
): Promise<Map<number, number>> => {
  const normalizedVersionIds = Array.from(new Set(
    versionIds.filter((versionId) => Number.isInteger(versionId) && versionId > 0)
  ));

  if (normalizedVersionIds.length === 0) {
    return new Map();
  }

  const result = await query<VersionAccessCountRow>(
    `SELECT l.ddv_id AS version_id,
            COUNT(*) AS access_count
       FROM dms_log l
       JOIN dms_doc_ver v ON v.ddv_id = l.ddv_id
       JOIN dms_file f ON f.dfi_id = v.ddv_pub_dfi_id
      WHERE l.ddv_id = ANY($1::integer[])
        AND l.dl_result = 'SUCCESS'
        AND (
             l.dl_action = 'DOCUMENT_PREVIEWED'
             OR (
                 l.dl_action = 'DOCUMENT_DOWNLOADED'
                 AND LOWER(LTRIM(COALESCE(f.dfi_ext, ''), '.')) <> 'pdf'
                 AND UPPER(
                       COALESCE(
                         l.dl_metadata ->> 'file_purpose',
                         'PUBLISHED_FILE'
                       )
                     ) <> 'SOURCE_FILE'
             )
        )
      GROUP BY l.ddv_id`,
    [normalizedVersionIds]
  );

  return new Map(
    result.rows.map((row) => [
      Number(row.version_id),
      Number(row.access_count || 0)
    ])
  );
};
