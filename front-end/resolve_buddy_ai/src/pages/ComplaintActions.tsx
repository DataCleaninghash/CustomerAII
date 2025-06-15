import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { Mail, Phone, CheckCircle, Clock, AlertCircle } from 'lucide-react';

interface ComplaintData {
  id: string;
  company: string;
  description: string;
  contactInfo: {
    email: string;
    phone: string;
  };
  status: string;
  callStatus?: string;
  callTranscript?: string[];
}

const ComplaintActions = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [complaint, setComplaint] = useState<ComplaintData | null>(null);
  const [emailStatus, setEmailStatus] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [callStatus, setCallStatus] = useState<string>('idle');
  const [callTranscript, setCallTranscript] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/complaints/${id}`)
      .then(res => res.json())
      .then(data => {
        setComplaint(data.complaint);
        setCallStatus(data.complaint.callStatus || 'idle');
        setCallTranscript(data.complaint.callTranscript || []);
        setLoading(false);
      })
      .catch(() => {
        setComplaint(null);
        setLoading(false);
      });
  }, [id]);

  const handleSendEmail = async () => {
    setEmailStatus('sending');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complaintId: id })
      });
      const data = await res.json();
      if (data.success) {
        setEmailStatus('sent');
        toast({
          title: 'Email sent successfully!',
          description: 'Your complaint has been sent to the company via email.'
        });
      } else {
        setEmailStatus('failed');
        toast({
          title: 'Failed to send email',
          description: data.error || 'Please try again or contact support.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      setEmailStatus('failed');
      toast({
        title: 'Failed to send email',
        description: 'Please try again or contact support.',
        variant: 'destructive',
      });
    }
  };

  const handleInitiateCall = async () => {
    setCallStatus('initiating');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/complaints/${id}/initiate-call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      setCallStatus(data.callResult?.status || 'completed');
      setCallTranscript(data.callResult?.transcript || []);
      if (data.success) {
        toast({
          title: 'Call completed!',
          description: 'The BlandAI agent completed the call.'
        });
      } else {
        toast({
          title: 'Call failed',
          description: data.error || 'Please try again or contact support.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      setCallStatus('failed');
      toast({
        title: 'Call failed',
        description: 'Please try again or contact support.',
        variant: 'destructive',
      });
    }
  };

  const handleBothActions = async () => {
    setEmailStatus('sending');
    setCallStatus('initiating');
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/execute-both`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ complaintId: id })
      });
      const data = await res.json();
      setEmailStatus(data.emailResult?.success ? 'sent' : 'failed');
      setCallStatus(data.callResult?.status || 'completed');
      setCallTranscript(data.callResult?.transcript || []);
      if (data.success) {
        toast({
          title: 'Both actions completed!',
          description: 'The BlandAI agent completed the call and the email was sent.'
        });
      } else {
        toast({
          title: 'One or both actions failed',
          description: data.error || 'Please try again or contact support.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      setEmailStatus('failed');
      setCallStatus('failed');
      toast({
        title: 'Both actions failed',
        description: 'Please try again or contact support.',
        variant: 'destructive',
      });
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
        {/* Complaint Summary */}
        <Card className="card-shadow">
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl">{complaint.company}</CardTitle>
                <CardDescription className="text-base mt-2">
                  {complaint.description}
                </CardDescription>
              </div>
              <Badge className="bg-green-100 text-green-800">
                {complaint.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <h4 className="font-medium flex items-center">
                  <Mail className="h-4 w-4 mr-2" />
                  Email Contact
                </h4>
                <p className="text-sm text-muted-foreground">{complaint.contactInfo.email}</p>
              </div>
              <div className="space-y-2">
                <h4 className="font-medium flex items-center">
                  <Phone className="h-4 w-4 mr-2" />
                  Phone Contact
                </h4>
                <p className="text-sm text-muted-foreground">{complaint.contactInfo.phone}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="card-shadow">
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Mail className="h-5 w-5 mr-2" />
                Send Email
              </CardTitle>
              <CardDescription>
                Send your complaint via email
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={handleSendEmail}
                disabled={emailStatus === 'sending'}
                className="w-full"
                variant={emailStatus === 'sent' ? 'secondary' : 'default'}
              >
                {emailStatus === 'sending' && <Clock className="mr-2 h-4 w-4 animate-spin" />}
                {emailStatus === 'sent' && <CheckCircle className="mr-2 h-4 w-4" />}
                {emailStatus === 'failed' && <AlertCircle className="mr-2 h-4 w-4" />}
                {emailStatus === 'idle' && 'Send Email'}
                {emailStatus === 'sending' && 'Sending...'}
                {emailStatus === 'sent' && 'Email Sent'}
                {emailStatus === 'failed' && 'Try Again'}
              </Button>
            </CardContent>
          </Card>

          <Card className="card-shadow">
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Phone className="h-5 w-5 mr-2" />
                Initiate Call
              </CardTitle>
              <CardDescription>
                Call the company using BlandAI
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={handleInitiateCall}
                disabled={callStatus === 'initiating' || callStatus === 'in_progress'}
                className="w-full"
                variant={callStatus === 'completed' ? 'secondary' : 'default'}
              >
                {callStatus === 'initiating' && <Clock className="mr-2 h-4 w-4 animate-spin" />}
                {callStatus === 'in_progress' && <Clock className="mr-2 h-4 w-4 animate-spin" />}
                {callStatus === 'completed' && <CheckCircle className="mr-2 h-4 w-4" />}
                {callStatus === 'failed' && <AlertCircle className="mr-2 h-4 w-4" />}
                {callStatus === 'idle' && 'Initiate Call'}
                {callStatus === 'initiating' && 'Connecting...'}
                {callStatus === 'in_progress' && 'In Progress'}
                {callStatus === 'completed' && 'Call Completed'}
                {callStatus === 'failed' && 'Try Again'}
              </Button>
            </CardContent>
          </Card>

          <Card className="card-shadow">
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Mail className="h-5 w-5 mr-2" />
                <Phone className="h-5 w-5 mr-2" />
                Execute Both Actions
              </CardTitle>
              <CardDescription>
                Send email and call simultaneously
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={handleBothActions}
                disabled={emailStatus === 'sending' || callStatus === 'initiating' || callStatus === 'in_progress'}
                className="w-full"
              >
                {(emailStatus === 'sending' || callStatus === 'initiating' || callStatus === 'in_progress') && <Clock className="mr-2 h-4 w-4 animate-spin" />}
                {emailStatus === 'sent' && callStatus === 'completed' && <CheckCircle className="mr-2 h-4 w-4" />}
                {emailStatus === 'failed' || callStatus === 'failed' ? <AlertCircle className="mr-2 h-4 w-4" /> : null}
                Execute Both Actions
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Call Status and Transcript */}
        <Card className="card-shadow">
          <CardHeader>
            <CardTitle>Call Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-2">
              <Badge className="bg-blue-100 text-blue-800">
                {callStatus.charAt(0).toUpperCase() + callStatus.slice(1)}
              </Badge>
            </div>
            <div>
              <h4 className="font-medium mb-2">Call Transcript</h4>
              {callTranscript && callTranscript.length > 0 ? (
                <div className="bg-gray-100 p-3 rounded text-sm whitespace-pre-line">
                  {callTranscript.map((line, idx) => (
                    <div key={idx}>{line}</div>
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground">No transcript available yet.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default ComplaintActions;
