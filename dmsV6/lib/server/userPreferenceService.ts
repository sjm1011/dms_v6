import type { AppTheme } from '../../types';
import { query } from './db';

const DEFAULT_THEME: AppTheme = 'soft-warm';

interface ThemeRow {
  theme: string;
}

export const isAppTheme = (value: unknown): value is AppTheme =>
  value === 'modern-dark' || value === 'modern-light' || value === 'soft-warm';

export const getUserTheme = async (userId: string): Promise<AppTheme | null> => {
  const result = await query<ThemeRow>(
    `SELECT dup_theme AS theme
       FROM dms_user_preferences
      WHERE dup_uid = $1`,
    [userId.trim().toUpperCase()]
  );
  const theme = result.rows[0]?.theme;
  return isAppTheme(theme) ? theme : null;
};

export const getUserThemeOrDefault = async (userId: string): Promise<AppTheme> =>
  (await getUserTheme(userId)) || DEFAULT_THEME;

export const ensureUserTheme = async (userId: string, initialTheme: AppTheme): Promise<AppTheme> => {
  const normalizedUserId = userId.trim().toUpperCase();
  await query(
    `INSERT INTO dms_user_preferences (
         dup_uid,
         dup_theme,
         dup_crtby,
         dup_crtat
       )
       VALUES ($1, $2, $1, CURRENT_TIMESTAMP)
       ON CONFLICT (dup_uid) DO NOTHING`,
    [normalizedUserId, initialTheme]
  );
  return (await getUserTheme(normalizedUserId)) || initialTheme;
};

export const updateUserTheme = async (userId: string, theme: AppTheme): Promise<AppTheme> => {
  const normalizedUserId = userId.trim().toUpperCase();
  const result = await query<ThemeRow>(
    `INSERT INTO dms_user_preferences (
         dup_uid,
         dup_theme,
         dup_crtby,
         dup_crtat,
         dup_updby,
         dup_updat
       )
       VALUES ($1, $2, $1, CURRENT_TIMESTAMP, $1, CURRENT_TIMESTAMP)
       ON CONFLICT (dup_uid) DO UPDATE
       SET dup_theme = EXCLUDED.dup_theme,
           dup_updby = EXCLUDED.dup_updby,
           dup_updat = EXCLUDED.dup_updat
       RETURNING dup_theme AS theme`,
    [normalizedUserId, theme]
  );
  return isAppTheme(result.rows[0]?.theme) ? result.rows[0].theme : theme;
};
