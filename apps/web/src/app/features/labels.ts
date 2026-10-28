import { ENROLLMENT_STATUS_LABELS, type EnrollmentInfo, SCHOOL_LEVEL_LABELS } from '@pl/shared';

export function studentLevel(
  s:
    | EnrollmentInfo['student']
    | { schoolLevel: EnrollmentInfo['student']['schoolLevel']; grade: number | null },
): string {
  if (!s.schoolLevel) return '';
  const level = SCHOOL_LEVEL_LABELS[s.schoolLevel].replace(/ \(.*\)$/, '');
  return s.grade ? `${level}, klasa ${s.grade}` : level;
}

export const statusLabel = (s: EnrollmentInfo['status']) => ENROLLMENT_STATUS_LABELS[s];

export const EVENT_LABELS: Record<string, string> = {
  joined: 'Rozpoczęcie współpracy',
  rejoined: 'Wznowienie przez ucznia (nowe zaproszenie)',
  goals_updated: 'Zmiana celów',
  paused: 'Wstrzymanie',
  resumed: 'Wznowienie',
  ended: 'Zakończenie',
};
