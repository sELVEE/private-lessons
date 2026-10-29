import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import type {
  AdminUserRow,
  ChildInfo,
  CreateInviteInput,
  EnrollmentDetail,
  EnrollmentInfo,
  EnrollmentStatus,
  InviteInfo,
  InvitePreview,
  LessonDetail,
  NoteInfo,
  ReportInfo,
  ReportInput,
  LessonInfo,
  OrgSettings,
  ParentLinkCode,
  ParentLinkInfo,
  SchoolLevel,
  SubjectInfo,
} from '@pl/shared';
import { firstValueFrom } from 'rxjs';

/** Thin typed wrapper over the stage 2 endpoints. Authorization happens on the server. */
@Injectable({ providedIn: 'root' })
export class TeachingApi {
  private readonly http = inject(HttpClient);

  subjects = () => this.get<SubjectInfo[]>('/api/subjects');
  createSubject = (name: string) => this.post<SubjectInfo>('/api/subjects', { name });
  renameSubject = (id: string, name: string) =>
    firstValueFrom(this.http.patch(`/api/subjects/${id}`, { name }));
  deleteSubject = (id: string) => firstValueFrom(this.http.delete(`/api/subjects/${id}`));
  addTopic = (subjectId: string, name: string) =>
    this.post(`/api/subjects/${subjectId}/topics`, { name });
  deleteTopic = (id: string) => firstValueFrom(this.http.delete(`/api/topics/${id}`));

  invites = () => this.get<InviteInfo[]>('/api/invites');
  createInvite = (input: CreateInviteInput) => this.post<InviteInfo>('/api/invites', input);
  revokeInvite = (id: string) => firstValueFrom(this.http.delete(`/api/invites/${id}`));
  previewInvite = (code: string) => this.post<InvitePreview>('/api/invites/preview', { code });
  redeemInvite = (code: string) => this.post<EnrollmentInfo>('/api/invites/redeem', { code });

  enrollments = () => this.get<EnrollmentInfo[]>('/api/enrollments');
  enrollment = (id: string) => this.get<EnrollmentDetail>(`/api/enrollments/${id}`);
  updateEnrollment = (id: string, patch: { goals?: string | null; status?: EnrollmentStatus }) =>
    firstValueFrom(this.http.patch<EnrollmentDetail>(`/api/enrollments/${id}`, patch));

  updateProfile = (schoolLevel: SchoolLevel, grade: number | null) =>
    firstValueFrom(this.http.patch('/api/account/profile', { schoolLevel, grade }));

  parentCode = () => this.post<ParentLinkCode>('/api/parent-links/code', {});
  redeemParentCode = (code: string) =>
    this.post<ParentLinkInfo>('/api/parent-links/redeem', { code });
  parentLinks = () => this.get<ParentLinkInfo[]>('/api/parent-links');
  removeParentLink = (id: string) => firstValueFrom(this.http.delete(`/api/parent-links/${id}`));
  children = () => this.get<ChildInfo[]>('/api/children');

  adminUsers = (q: string, reason: string) =>
    firstValueFrom(
      this.http.get<AdminUserRow[]>('/api/admin/users', {
        params: new HttpParams({ fromObject: { q, reason } }),
      }),
    );
  adminSetStatus = (id: string, status: AdminUserRow['status'], reason: string) =>
    firstValueFrom(this.http.patch(`/api/admin/users/${id}/status`, { status, reason }));

  lessons = (from: Date, to: Date, enrollmentId?: string) =>
    firstValueFrom(
      this.http.get<LessonInfo[]>('/api/lessons', {
        params: new HttpParams({
          fromObject: {
            from: from.toISOString(),
            to: to.toISOString(),
            ...(enrollmentId ? { enrollmentId } : {}),
          },
        }),
      }),
    );
  lesson = (id: string) => this.get<LessonDetail>(`/api/lessons/${id}`);
  createLesson = (input: {
    enrollmentId: string;
    startsAt: string;
    durationMin: number;
    repeatWeeks: number;
    location?: string;
    topic?: string;
  }) => this.post<LessonInfo[]>('/api/lessons', input);
  rescheduleLesson = (id: string, startsAt: string, durationMin: number) =>
    this.post<LessonDetail>(`/api/lessons/${id}/reschedule`, { startsAt, durationMin });
  cancelLesson = (id: string, reason?: string) =>
    this.post<LessonDetail>(`/api/lessons/${id}/cancel`, { reason });
  completeLesson = (id: string, attendance: 'present' | 'late' | 'absent') =>
    this.post<LessonDetail>(`/api/lessons/${id}/complete`, { attendance });
  decideCharge = (id: string, chargeable: boolean) =>
    this.post<LessonDetail>(`/api/lessons/${id}/charge`, { chargeable });
  settings = () => this.get<OrgSettings>('/api/settings');
  saveSettings = (s: OrgSettings) => firstValueFrom(this.http.put<OrgSettings>('/api/settings', s));

  note = (lessonId: string) => this.get<NoteInfo>(`/api/lessons/${lessonId}/note`);
  saveNote = (lessonId: string, content: string) =>
    firstValueFrom(this.http.put<NoteInfo>(`/api/lessons/${lessonId}/note`, { content }));
  report = (lessonId: string) => this.get<ReportInfo | null>(`/api/lessons/${lessonId}/report`);
  saveReport = (lessonId: string, input: ReportInput) =>
    firstValueFrom(this.http.put<ReportInfo>(`/api/lessons/${lessonId}/report`, input));
  reports = (enrollmentId: string) =>
    this.get<ReportInfo[]>(`/api/enrollments/${enrollmentId}/reports`);

  private get<T>(url: string) {
    return firstValueFrom(this.http.get<T>(url));
  }

  private post<T = unknown>(url: string, body: object) {
    return firstValueFrom(this.http.post<T>(url, body));
  }
}
