/**
 * Blackboard LMS: get course content via single Learn REST API contents endpoint.
 */

/** Content handler IDs that we pull from Blackboard (documents, files, links, assignments, etc.). */
const SUPPORTED_PULL_FROM_BLACKBOARD_CONTENT_TYPES = new Set([
  'resource/x-bb-document',
  'resource/x-bb-file',
  'resource/x-bb-externallink',
  'resource/x-bb-assignment',
  'resource/x-bb-asmt-test-link',
  'resource/x-bb-blti-link',
  'resource/x-bb-courselink',
  'resource/x-bb-forumlink',
]);

type BlackboardContentItem = {
  contentHandler?: { id?: string };
  [key: string]: unknown;
};

function isBlackboardModule(content: BlackboardContentItem): boolean {
  const handlerId = content?.contentHandler?.id ?? '';
  return handlerId === 'resource/x-bb-folder';
}

function filterCourseContentResults(results: unknown[]): unknown[] {
  return results.filter((item): item is BlackboardContentItem => {
    if (!item || typeof item !== 'object') return false;
    const content = item as BlackboardContentItem;
    if (isBlackboardModule(content)) return false;
    const handlerId = content.contentHandler?.id;
    return typeof handlerId === 'string' && SUPPORTED_PULL_FROM_BLACKBOARD_CONTENT_TYPES.has(handlerId);
  });
}

export type GetCourseContentParams = {
  apiBaseUrl: string;
  importedId: string;
  headers: Record<string, string>;
};

type PaginatedResponse = {
  results?: unknown[];
  paging?: { nextPage?: string };
};

async function fetchPage(
  url: string,
  headers: Record<string, string>
): Promise<{ body: unknown; nextPage: string | undefined }> {
  const res = await fetch(url, { method: 'GET', headers });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Blackboard API ${res.status}: ${bodyText || res.statusText}`);
  }
  const body = bodyText ? (JSON.parse(bodyText) as PaginatedResponse) : null;
  const nextPage = body && typeof body === 'object' && body.paging?.nextPage ? body.paging.nextPage : undefined;
  return { body, nextPage };
}

async function fetchAllPages(
  apiBaseUrl: string,
  initialUrl: string,
  headers: Record<string, string>
): Promise<unknown> {
  const { body, nextPage: firstNext } = await fetchPage(initialUrl, headers);
  if (!body || typeof body !== 'object') return body;
  const paginated = body as PaginatedResponse;
  if (!Array.isArray(paginated.results) || !firstNext) {
    return body;
  }
  const combined = [...paginated.results];
  const resolveUrl = (pathOrUrl: string) =>
    pathOrUrl.startsWith('http') ? pathOrUrl : `${apiBaseUrl.replace(/\/$/, '')}${pathOrUrl.startsWith('/') ? '' : '/'}${pathOrUrl}`;
  let nextUrl: string = resolveUrl(firstNext);
  while (nextUrl) {
    const { body: pageBody, nextPage: next } = await fetchPage(nextUrl, headers);
    if (pageBody && typeof pageBody === 'object' && Array.isArray((pageBody as PaginatedResponse).results)) {
      combined.push(...(pageBody as PaginatedResponse).results!);
    }
    nextUrl = next ? resolveUrl(next) : '';
  }
  return { ...paginated, results: combined, paging: {} };
}
/**
 * Standalone port of BlackboardClient._extract_module_item_data (Python) to JavaScript.
 * - No dependencies
 * - Throws if content is falsy/empty
 * - Mirrors branching/field mapping from the original function
 */

// ---- "Enums" (string values are placeholders; replace with your real BB values if you have them) ----
const BlackboardContentType = Object.freeze({
  FOLDER: "resource/x-bb-folder",
  FILE: "resource/x-bb-file",
  // BB sometimes uses different spellings for external link + LTI ids.
  EXTERNAL_LINK: "resource/x-bb-external-link",
  EXTERNAL_LINK_ALT: "resource/x-bb-externallink",
  ASSESSMENT_TEST_LINK: "resource/x-bb-asmt-test-link",
  LTI_LINK: "resource/x-bb-lti-link",
  LTI_LINK_ALT: "resource/x-bb-blti-link",
  DOCUMENT: "resource/x-bb-document",
  UNKNOWN: "UNKNOWN",
});

const PluginType = Object.freeze({
  TEXT: "TEXT",
  FILE: "FILE",
  EXTERNAL_URL: "EXTERNAL_URL",
  ASSIGNMENT: "ASSIGNMENT",
});

// ---- Error type ----
class BlackboardResourceNotFoundException extends Error {
  constructor(message = "Blackboard resource not found") {
    super(message);
    this.name = "BlackboardResourceNotFoundException";
  }
}

/**
 * Best-effort equivalent of self._extract_content_published_status(content).
 * If you already have an implementation, pass it in via options.extractContentPublishedStatus.
 */
function defaultExtractContentPublishedStatus(content: any) {
  // Common BB payload patterns vary; keep conservative defaults.
  const available = content?.availability?.available;
  if (typeof available === "boolean") return available;
  if (typeof available === "string") {
    const v = available.trim().toLowerCase();
    if (["yes", "y", "true", "available"].includes(v)) return true;
    if (["no", "n", "false", "unavailable"].includes(v)) return false;
  }
  if (typeof content?.isAvailable === "boolean") return content.isAvailable;
  if (typeof content?.available === "boolean") return content.available;
  return false;
}

function isPlainNonEmptyObject(value: any) {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function joinUrl(baseUrl: string, pathOrUrl: string) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  if (!baseUrl) return pathOrUrl;
  return `${String(baseUrl).replace(/\/+$/, "")}/${String(pathOrUrl).replace(/^\/+/, "")}`;
}

function extractModuleItemData(content: any, options: { apiBaseUrl?: string, extractContentPublishedStatus?: (content: any) => boolean } = {}) {
  const { apiBaseUrl = "", extractContentPublishedStatus = defaultExtractContentPublishedStatus } = options;

  if (Array.isArray(content)) {
    return content.map((c: any) => extractModuleItemData(c, options));
  }

  if (!isPlainNonEmptyObject(content)) {
    throw new BlackboardResourceNotFoundException();
  }

  let details = null;

  const rawHandlerId = content?.contentHandler?.id;
  const handlerId = typeof rawHandlerId === "string" ? rawHandlerId : BlackboardContentType.UNKNOWN;

  const normalizedHandlerId = (() => {
    switch (handlerId) {
      case BlackboardContentType.EXTERNAL_LINK_ALT:
        return BlackboardContentType.EXTERNAL_LINK;
      case BlackboardContentType.LTI_LINK_ALT:
        return BlackboardContentType.LTI_LINK;
      case BlackboardContentType.DOCUMENT:
        // Treat BB documents as a text-like content item for plugin mapping.
        return BlackboardContentType.DOCUMENT;
      default:
        return handlerId;
    }
  })();

  // "type" is a reserved-ish identifier in some contexts; use pluginType locally.
  let reference;

  switch (normalizedHandlerId) {
    case BlackboardContentType.FOLDER: {
      reference = content.id;
      break;
    }

    case BlackboardContentType.DOCUMENT: {
      reference = content.id;
      break;
    }

    case BlackboardContentType.FILE: {
      reference = content.id;
      break;
    }

    case BlackboardContentType.EXTERNAL_LINK: {
      break;
    }

    case BlackboardContentType.ASSESSMENT_TEST_LINK: {
      reference = content.contentHandler.gradeColumnId;

      const href = Array.isArray(content.links)
        ? (content.links.find((l) => l && "href" in l) || {}).href
        : null;

      const secureBrowserRequired =
        content?.contentHandler?.proctoring &&
        "secureBrowserRequiredToTake" in content.contentHandler.proctoring
          ? Boolean(content.contentHandler.proctoring.secureBrowserRequiredToTake)
          : false;

      details = {
        id: reference,
        type: PluginType.ASSIGNMENT,
        is_lockdown_enabled: secureBrowserRequired,
        // In your sample data, href is a UI redirect ("/ultra/redirect?..."), not an API href.
        // Only join with apiBaseUrl when it looks like an API-ish path.
        url:
          typeof href === "string" && /^\/(learn\/api\/public\/v1|courses\/|v1\/)/.test(href)
            ? joinUrl(apiBaseUrl, href)
            : null,
        extra: "assessmentId" in (content.contentHandler || {})
          ? { assessment_id: content.contentHandler.assessmentId }
          : null,
      };
      break;
    }

    case BlackboardContentType.LTI_LINK: {
      reference = content.id;

      details = {
        id: reference,
        type: PluginType.EXTERNAL_URL,
        extra: content?.contentHandler?.customParameters ?? {},
      };
      break;
    }
  }

  const isKnownLmsType =
    typeof normalizedHandlerId === "string" && Object.values(BlackboardContentType).includes(normalizedHandlerId);

  return {
    id: content.id,
    module_id: content.parentId,
    title: content.title,
    lms_type: isKnownLmsType ? normalizedHandlerId : BlackboardContentType.UNKNOWN,
    reference,
    position: content.position,
    is_published: Boolean(extractContentPublishedStatus(content)),
    details,
  };
}


/** Get Blackboard course content (syllabus/contents) with recursive=true. Follows paging until all results are fetched. Returns only items that are not folder modules and whose contentHandler.id is in the supported pull types. */
export async function getCourseContent(params: GetCourseContentParams): Promise<unknown> {
  const { apiBaseUrl, importedId, headers } = params;
  const url = `${apiBaseUrl}/learn/api/public/v1/courses/${encodeURIComponent(importedId)}/contents?recursive=true`;
  const out = await fetchAllPages(apiBaseUrl, url, headers);
  if (out && typeof out === 'object' && Array.isArray((out as PaginatedResponse).results)) {
    const paginated = out as PaginatedResponse;
    return { ...paginated, results: extractModuleItemData(filterCourseContentResults(paginated.results!)) };
  }
  return out;
}

export type GetCourseStudentsParams = {
  apiBaseUrl: string;
  importedId: string;
  headers: Record<string, string>;
  /** When true, exclude members with Instructor role (matches Python students_only). */
  studentsOnly?: boolean;
};

type NRPSMember = {
  user_id?: string;
  userId?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
  roles?: (string | unknown)[];
  [key: string]: unknown;
};

/** Convert NRPS member to a consistent LMS user shape (matches Python _convert_data_to_lms_user). */
function convertToLmsUser(member: NRPSMember): Record<string, unknown> | null {
  if (!member || typeof member !== 'object') return null;
  const roles = member.roles ?? [];
  const roleStrings = roles
    .filter((r): r is string => typeof r === 'string')
    .filter(Boolean);
  return {
    user_id: member.user_id ?? member.userId ?? null,
    name: (member.name ?? [member.given_name, member.family_name].filter(Boolean).join(' ')) || null,
    given_name: member.given_name ?? null,
    family_name: member.family_name ?? null,
    email: member.email ?? null,
    roles: roleStrings,
  };
}

/** True if member has Instructor role (exact or URI ending with #Instructor). */
function hasInstructorRole(member: NRPSMember): boolean {
  const roles = member.roles ?? [];
  return roles.some(
    (role) =>
      typeof role === 'string' &&
      (role === 'Instructor' || role.endsWith('#Instructor'))
  );
}

/** Get Blackboard course students (LTI Names & Roles / NRPS). Fetches members, optionally filters to students only (excludes Instructor), and returns a list of converted LMS users (matches Python get_course_users). */
export async function getCourseStudents(params: GetCourseStudentsParams): Promise<unknown> {
  const { apiBaseUrl, importedId, headers, studentsOnly = false } = params;
  const url = `${apiBaseUrl}/learn/api/v1/lti/external/namesandroles/${encodeURIComponent(importedId)}`;
  const res = await fetch(url, { method: 'GET', headers });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(`Blackboard NRPS API ${res.status}: ${bodyText || res.statusText}`);
  }
  const data = bodyText ? (JSON.parse(bodyText) as { members?: unknown[] }) : null;
  let members: NRPSMember[] = Array.isArray(data?.members) ? (data.members as NRPSMember[]) : [];
  if (!Array.isArray(members)) {
    members = [];
  }
  if (studentsOnly) {
    members = members.filter((m) => !hasInstructorRole(m));
  }
  const converted: Record<string, unknown>[] = [];
  for (const member of members) {
    const user = convertToLmsUser(member);
    if (user) converted.push(user);
  }
  return { members: converted };
}
