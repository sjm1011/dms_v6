import { query } from './db';

export const getEmployeeByUid = async (uid: string) => {
  const normalizedUid = String(uid || '').trim();

  if (!normalizedUid) {
    return [];
  }

  const result = await query<{ uid: string; name: string }>(
    `SELECT emp_id AS uid,
            emp_name AS name
       FROM employee
      WHERE UPPER(emp_id) = UPPER($1)
        AND emp_incumbent = 0
      ORDER BY emp_id
      LIMIT 1`,
    [normalizedUid]
  );

  return result.rows;
};

export const listDepartments = async () => {
  const result = await query<{ dept_id: string; dept_name: string }>(
    `SELECT dept_id::text AS dept_id,
            dept_name
       FROM department
      ORDER BY dept_id`
  );

  return result.rows;
};
