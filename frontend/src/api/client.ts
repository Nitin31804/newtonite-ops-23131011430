import { WorkItem, WorkItemDetailData, Team, StatsData } from '../types';

export class ApiError extends Error {
  status: number;
  latestItem?: WorkItem;
  constructor(message: string, status: number, latestItem?: WorkItem) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.latestItem = latestItem;
  }
}

export function generateIdempotencyKey(): string {
  return `idem-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

class ApiClient {
  private getHeaders(idempotencyKey?: string): HeadersInit {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    const activeUserId = localStorage.getItem('newtonite_active_user_id');
    if (activeUserId) {
      headers['x-user-id'] = activeUserId;
    }

    const token = localStorage.getItem('newtonite_jwt_token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    if (idempotencyKey) {
      headers['idempotency-key'] = idempotencyKey;
    }

    return headers;
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    const contentType = res.headers.get('content-type');
    const isJson = contentType && contentType.includes('application/json');
    const data = isJson ? await res.json() : await res.text();

    if (!res.ok) {
      const errorMessage = data?.error || (typeof data === 'string' ? data : 'API Request Failed');
      throw new ApiError(errorMessage, res.status, data?.latestItem);
    }

    return data as T;
  }

  async getStats(): Promise<StatsData> {
    const res = await fetch('/api/stats', { headers: this.getHeaders() });
    return this.handleResponse<StatsData>(res);
  }

  async getPersonas(): Promise<any[]> {
    const res = await fetch('/api/auth/personas', { headers: this.getHeaders() });
    return this.handleResponse<any[]>(res);
  }

  async getMe(): Promise<{ user: any }> {
    const res = await fetch('/api/auth/me', { headers: this.getHeaders() });
    return this.handleResponse<{ user: any }>(res);
  }

  async getSetupStatus(): Promise<{ needsSetup: boolean }> {
    const res = await fetch('/api/auth/setup-status', { headers: this.getHeaders() });
    return this.handleResponse<{ needsSetup: boolean }>(res);
  }

  async setupInitialAdmin(payload: { name: string; email: string; password: string }): Promise<{ token: string; user: any }> {
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return this.handleResponse<{ token: string; user: any }>(res);
  }

  async login(email: string, password = 'password123'): Promise<{ token: string; user: any }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return this.handleResponse<{ token: string; user: any }>(res);
  }

  async getUsers(): Promise<any[]> {
    const res = await fetch('/api/auth/users', { headers: this.getHeaders() });
    return this.handleResponse<any[]>(res);
  }

  async getTeams(): Promise<Team[]> {
    const res = await fetch('/api/teams', { headers: this.getHeaders() });
    return this.handleResponse<Team[]>(res);
  }

  async getTeamMembers(teamId: string): Promise<any[]> {
    const res = await fetch(`/api/teams/${teamId}/members`, { headers: this.getHeaders() });
    return this.handleResponse<any[]>(res);
  }

  async getItems(params: {
    teamId?: string;
    status?: string;
    priority?: string;
    view?: string;
    q?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ items: WorkItem[]; pagination: { total: number; limit: number; offset: number; hasMore: boolean } }> {
    const search = new URLSearchParams();
    if (params.teamId) search.set('teamId', params.teamId);
    if (params.status) search.set('status', params.status);
    if (params.priority) search.set('priority', params.priority);
    if (params.view) search.set('view', params.view);
    if (params.q) search.set('q', params.q);
    if (params.limit) search.set('limit', params.limit.toString());
    if (params.offset !== undefined) search.set('offset', params.offset.toString());

    const res = await fetch(`/api/items?${search.toString()}`, { headers: this.getHeaders() });
    return this.handleResponse(res);
  }

  async getItemDetails(id: string): Promise<WorkItemDetailData> {
    const res = await fetch(`/api/items/${id}`, { headers: this.getHeaders() });
    return this.handleResponse<WorkItemDetailData>(res);
  }

  async createItem(
    payload: {
      title: string;
      description: string;
      type: string;
      priority: string;
      team_id: string;
      assignee_id?: string | null;
    },
    idempotencyKey?: string
  ): Promise<WorkItem> {
    const res = await fetch('/api/items', {
      method: 'POST',
      headers: this.getHeaders(idempotencyKey || generateIdempotencyKey()),
      body: JSON.stringify(payload),
    });
    return this.handleResponse<WorkItem>(res);
  }

  async claimItem(id: string): Promise<{ message: string; item: WorkItem }> {
    const res = await fetch(`/api/items/${id}/claim`, {
      method: 'POST',
      headers: this.getHeaders(),
    });
    return this.handleResponse(res);
  }

  async updateItem(
    id: string,
    payload: {
      title?: string;
      description?: string;
      priority?: string;
      assignee_id?: string | null;
      version: number;
    }
  ): Promise<{ message: string; item: WorkItem }> {
    const res = await fetch(`/api/items/${id}`, {
      method: 'PATCH',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });
    return this.handleResponse(res);
  }

  async transitionStatus(
    id: string,
    targetStatus: string,
    reason?: string,
    version?: number
  ): Promise<{ message: string; item: WorkItem }> {
    const res = await fetch(`/api/items/${id}/transition`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ targetStatus, reason, version }),
    });
    return this.handleResponse(res);
  }

  async addComment(id: string, content: string): Promise<any> {
    const res = await fetch(`/api/items/${id}/comments`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ content }),
    });
    return this.handleResponse(res);
  }
}

export const api = new ApiClient();
