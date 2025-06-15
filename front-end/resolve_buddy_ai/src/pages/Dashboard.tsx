import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileText, Clock, CheckCircle, AlertCircle, Plus } from 'lucide-react';

const Dashboard = () => {
  const navigate = useNavigate();
  const [hasSubscription, setHasSubscription] = useState(false);
  const [complaintCount, setComplaintCount] = useState(0);
  const [complaints, setComplaints] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const subscriptionStatus = localStorage.getItem('subscription_status');
    setHasSubscription(!!subscriptionStatus);
    // Track complaint count for unpaid users
    const count = parseInt(localStorage.getItem('complaint_count') || '0', 10);
    setComplaintCount(count);

    // Fetch real complaints for the user
    const userId = localStorage.getItem('user_id');
    if (!userId) {
      setComplaints([]);
      setLoading(false);
      return;
    }
    fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3000'}/user/${userId}/complaints`)
      .then(res => res.json())
      .then(data => {
        setComplaints(data.complaints || []);
        setLoading(false);
      })
      .catch(() => {
        setComplaints([]);
        setLoading(false);
      });
  }, []);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'resolved':
        return <CheckCircle className="h-5 w-5 text-success" />;
      case 'in_progress':
        return <Clock className="h-5 w-5 text-warning" />;
      case 'pending':
        return <AlertCircle className="h-5 w-5 text-info" />;
      default:
        return <FileText className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'resolved':
        return 'Resolved';
      case 'in_progress':
        return 'In Progress';
      case 'pending':
        return 'Pending';
      default:
        return 'Unknown';
    }
  };

  return (
    <Layout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              Dashboard
            </h1>
            <p className="text-muted-foreground mt-2">
              Manage your complaints and track their progress
            </p>
            {!hasSubscription && complaintCount >= 3 && (
              <div className="mt-2 p-2 bg-yellow-100 text-yellow-800 rounded">
                You have reached your free complaint limit. Please pay to submit more complaints.
              </div>
            )}
          </div>
          <Button 
            onClick={() => navigate('/new-complaint')}
            className="stripe-gradient text-white hover:opacity-90"
            size="lg"
            disabled={!hasSubscription && complaintCount >= 3}
          >
            <Plus className="h-5 w-5 mr-2" />
            New Complaint
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <Card className="card-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Complaints</p>
                  <p className="text-2xl font-bold">{complaints.length}</p>
                </div>
                <FileText className="h-8 w-8 text-primary" />
              </div>
            </CardContent>
          </Card>

          <Card className="card-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Resolved</p>
                  <p className="text-2xl font-bold text-success">{complaints.filter(c => c.status === 'resolved').length}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-success" />
              </div>
            </CardContent>
          </Card>

          <Card className="card-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">In Progress</p>
                  <p className="text-2xl font-bold text-warning">{complaints.filter(c => c.status === 'in_progress').length}</p>
                </div>
                <Clock className="h-8 w-8 text-warning" />
              </div>
            </CardContent>
          </Card>

          <Card className="card-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-info">{complaints.filter(c => c.status === 'pending').length}</p>
                </div>
                <AlertCircle className="h-8 w-8 text-info" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Complaints */}
        <Card className="card-shadow">
          <CardHeader>
            <CardTitle>Recent Complaints</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {loading ? (
                <div>Loading complaints...</div>
              ) : complaints.length === 0 ? (
                <div>No complaints found.</div>
              ) : (
                complaints.map((complaint) => (
                  <div 
                    key={complaint.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/complaint/${complaint.id}`)}
                  >
                    <div className="flex items-center space-x-4">
                      {getStatusIcon(complaint.status)}
                      <div>
                        <h3 className="font-semibold">{complaint.title || complaint.rawText?.slice(0, 40) || 'Complaint'}</h3>
                        <p className="text-sm text-muted-foreground">{complaint.company || complaint.companyInfo?.name || 'Unknown Company'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-sm font-medium">{getStatusText(complaint.status)}</span>
                      <p className="text-xs text-muted-foreground">
                        Updated {complaint.lastUpdate || complaint.updatedAt || complaint.createdAt || '-'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
};

export default Dashboard;
