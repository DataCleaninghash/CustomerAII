// API service layer for backend communication
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

class ApiService {
  private async request(endpoint: string, options: RequestInit = {}) {
    const url = `${API_BASE_URL}${endpoint}`;
    const token = localStorage.getItem('authToken');
    
    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` }),
        ...options.headers,
      },
      ...options,
    };

    const response = await fetch(url, config);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  }

  // Authentication
  async login(identifier: string, password: string) {
    return this.request('/signin', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    });
  }

  async register(userData: { email: string; password: string; phone: string; name: string }) {
    return this.request('/signup', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  // Complaints
  async submitComplaint(complaintData: FormData) {
    const url = `${API_BASE_URL}/complaint`;
    const token = localStorage.getItem('authToken');
    // Convert FormData to plain object
    const data: Record<string, string> = {};
    complaintData.forEach((value, key) => {
      data[key] = value as string;
    });
    const config: RequestInit = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      },
      body: JSON.stringify(data)
    };
    const response = await fetch(url, config);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return response.json();
  }

  async getComplaints() {
    return this.request('/complaints');
  }

  async getComplaint(id: string) {
    return this.request(`/complaints/${id}`);
  }

  async sendComplaintEmail(id: string) {
    return this.request(`/complaints/${id}/send-email`, {
      method: 'POST',
    });
  }

  async initiateCall(id: string) {
    return this.request(`/complaints/${id}/initiate-call`, {
      method: 'POST',
    });
  }

  // WebSocket connection for real-time updates
  connectWebSocket(complaintId: string, onMessage: (data: unknown) => void) {
    const wsUrl = `${API_BASE_URL.replace('http', 'ws')}/complaints/${complaintId}/websocket`;
    const ws = new WebSocket(wsUrl);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      onMessage(data);
    };
    
    return ws;
  }

  // Fetch user profile by ID
  async getUserProfile(userId: string) {
    return this.request(`/user/${userId}`);
  }

  // Send follow-up answer and get next question
  async sendFollowUpAnswer({ questionId, answer, complaintId }: { questionId: string; answer: string; complaintId: string }) {
    return this.request('/complaint', {
      method: 'POST',
      body: JSON.stringify({
        isFollowup: true,
        complaintId,
        questionId,
        answer,
        text: answer // Include answer as text for processing
      }),
    });
  }
}

export const apiService = new ApiService();