import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Mail, Phone, CheckCircle, Clock, FileText, MessageSquare } from 'lucide-react';

interface TimelineEvent {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: string;
  status: string;
  details?: any;
}

interface ComplaintDetails {
  id: string;
  company: string;
  description: string;
  status: string;
  createdAt: string;
  timeline: TimelineEvent[];
  callTranscript?: string[];
  callStatus?: string;
  emailResults?: {
    sent: boolean;
    deliveredAt?: string;
    readAt?: string;
  };
}

const ComplaintTracking = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [complaint, setComplaint] = useState<ComplaintDetails | null>(null);
  const [expandedEvents, setExpandedEvents] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/complaints/${id}`)
      .then(res => res.json())
      .then(data => {
        setComplaint(data.complaint);
        setLoading(false);
      })
      .catch(() => {
        setComplaint(null);
        setLoading(false);
      });
  }, [id]);

  const toggleEventExpansion = (eventId: string) => {
    setExpandedEvents(prev =>
      prev.includes(eventId)
        ? prev.filter(id => id !== eventId)
        : [...prev, eventId]
    );
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-blue-600 animate-pulse-soft" />;
      case 'failed':
        return <Clock className="h-5 w-5 text-red-600" />;
      default:
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'complaint_filed':
        return <FileText className="h-4 w-4" />;
      case 'email_sent':
        return <Mail className="h-4 w-4" />;
      case 'call_initiated':
      case 'call_completed':
        return <Phone className="h-4 w-4" />;
      case 'response_received':
        return <MessageSquare className="h-4 w-4" />;
      default:
        return <Clock className="h-4 w-4" />;
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-64">
          <div className="animate-pulse-soft">Loading complaint details...</div>
        </div>
      </Layout>
    );
  }

  if (!complaint) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-64">
          <div className="text-red-500">Complaint not found.</div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">{complaint.company}</h1>
            <p className="text-muted-foreground mt-1">{complaint.description}</p>
            <p className="text-sm text-muted-foreground mt-2">
              Filed on {new Date(complaint.createdAt).toLocaleDateString()}
            </p>
          </div>
          <Badge className="bg-blue-100 text-blue-800">
            {complaint.status}
          </Badge>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="card-shadow">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Email Status</p>
                  <p className="font-medium text-green-600">{complaint.emailResults?.sent ? 'Delivered & Read' : 'Not Sent'}</p>
                </div>
                <Mail className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
          <Card className="card-shadow">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Call Status</p>
                  <p className="font-medium text-blue-600">{complaint.callStatus || 'Not Started'}</p>
                </div>
                <Phone className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Timeline */}
        <Card className="card-shadow">
          <CardHeader>
            <CardTitle>Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {complaint.timeline && complaint.timeline.length > 0 ? (
                complaint.timeline.map(event => (
                  <div key={event.id} className="border rounded p-3">
                    <div className="flex items-center space-x-2">
                      {getEventIcon(event.type)}
                      <span className="font-semibold">{event.title}</span>
                      {getStatusIcon(event.status)}
                      <span className="text-xs text-muted-foreground ml-auto">{new Date(event.timestamp).toLocaleString()}</span>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">{event.description}</div>
                    {event.details && (
                      <Collapsible open={expandedEvents.includes(event.id)}>
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" onClick={() => toggleEventExpansion(event.id)}>
                            <ChevronDown className="h-4 w-4 mr-1" /> Details
                          </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <pre className="bg-gray-100 p-2 rounded text-xs mt-2 whitespace-pre-wrap">{JSON.stringify(event.details, null, 2)}</pre>
                        </CollapsibleContent>
                      </Collapsible>
                    )}
                  </div>
                ))
              ) : (
                <div>No timeline events found.</div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Call Transcript */}
        <Card className="card-shadow">
          <CardHeader>
            <CardTitle>Call Transcript</CardTitle>
          </CardHeader>
          <CardContent>
            {complaint.callTranscript && complaint.callTranscript.length > 0 ? (
              <div className="bg-gray-100 p-3 rounded text-sm whitespace-pre-line">
                {complaint.callTranscript.map((line, idx) => (
                  <div key={idx}>{line}</div>
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground">No transcript available yet.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ComplaintTracking;
