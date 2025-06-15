import { useState, useRef, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { useNavigate } from 'react-router-dom';
import { Paperclip, Mic, Trash2, Send, FileText, Upload } from 'lucide-react';
import { apiService } from '@/services/api';

interface FollowUpQuestion {
  id: string;
  question: string;
  type: 'text' | 'select' | 'multiple';
  options?: string[];
  answer?: string;
}

const NewComplaint = () => {
  const [complaintText, setComplaintText] = useState('');
  const [uploadedImages, setUploadedImages] = useState<File[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detectedCompany, setDetectedCompany] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<'input' | 'questions' | 'review'>('input');
  const [complaintLimitReached, setComplaintLimitReached] = useState(false);
  const [hasSubscription, setHasSubscription] = useState(false);
  const [chatHistory, setChatHistory] = useState<{ sender: 'bot' | 'user'; message: string }[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<FollowUpQuestion | null>(null);
  const [complaintId, setComplaintId] = useState<string | null>(null);
  const [currentAnswer, setCurrentAnswer] = useState('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    const subscriptionStatus = localStorage.getItem('subscription_status');
    setHasSubscription(!!subscriptionStatus);
    const count = parseInt(localStorage.getItem('complaint_count') || '0', 10);
    if (!subscriptionStatus && count >= 3) {
      setComplaintLimitReached(true);
    }
  }, []);

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length > 0) {
      setUploadedImages(prev => [...prev, ...imageFiles]);
      toast({
        title: "Images uploaded",
        description: `${imageFiles.length} image(s) uploaded successfully.`,
      });
    }
  };

  const removeImage = (index: number) => {
    setUploadedImages(prev => prev.filter((_, i) => i !== index));
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        setAudioBlob(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setAudioDuration(0);
      
      // Start timer
      timerRef.current = setInterval(() => {
        setAudioDuration(prev => prev + 1);
      }, 1000);

      toast({
        title: "Recording started",
        description: "Speak your complaint now.",
      });
    } catch (error) {
      toast({
        title: "Recording failed",
        description: "Unable to access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      toast({
        title: "Recording stopped",
        description: `Audio recorded for ${audioDuration} seconds.`,
      });
    }
  };

  const deleteAudio = () => {
    setAudioBlob(null);
    setAudioDuration(0);
    toast({
      title: "Audio deleted",
      description: "Your audio recording has been removed.",
    });
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const processComplaint = async () => {
    setIsProcessing(true);
    try {
      // Prepare FormData
      const formData = new FormData();
      if (complaintText.trim()) {
        formData.append('text', complaintText);
      }
      uploadedImages.forEach((file, idx) => {
        formData.append('image', file, file.name);
      });
      if (audioBlob) {
        formData.append('audio', audioBlob, 'recording.wav');
      }

      // Add user's complaint to chatHistory
      setChatHistory([{ sender: 'user', message: complaintText }]);
      
      // Debug log: check if API call is triggered
      console.log('Submitting complaint...', formData);
      // Send to backend
      const response = await apiService.submitComplaint(formData);
      
      // Debug log: backend response
      console.log('Backend response:', response);
      
      setDetectedCompany(response.company || '');
      
      if (response.complaintId) {
        setComplaintId(response.complaintId);
      } else {
        throw new Error('No complaintId returned from backend');
      }

      // Check if there's a next question
      if (response.nextQuestion) {
        setCurrentQuestion(response.nextQuestion);
        setChatHistory(prev => [
          ...prev,
          { sender: 'bot', message: response.nextQuestion.question }
        ]);
        setCurrentStep('questions');
      } else {
        // No questions needed, go straight to processing
        setChatHistory(prev => [
          ...prev,
          { sender: 'bot', message: 'Thank you! We are now processing your complaint.' }
        ]);
        setTimeout(() => {
          submitComplaint();
        }, 2000);
      }

      toast({
        title: 'Complaint processed!',
        description: "We've analyzed your complaint and detected the target company.",
      });
    } catch (error) {
      console.error('Error processing complaint:', error);
      toast({
        title: 'Processing failed',
        description: 'Please try again or contact support.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendAnswer = async () => {
    if (!currentQuestion || !complaintId || !currentAnswer.trim()) return;
    
    // Add user's answer to chat
    setChatHistory(prev => [...prev, { sender: 'user', message: currentAnswer }]);
    
    // Debug log: print follow-up answer payload
    console.log('[Follow-up Answer] Sending to backend:', {
      questionId: currentQuestion.id,
      answer: currentAnswer,
      complaintId
    });
    
    setIsProcessing(true);
    try {
      const response = await apiService.sendFollowUpAnswer({
        questionId: currentQuestion.id,
        answer: currentAnswer,
        complaintId
      });

      console.log('Follow-up response:', response);

      if (response.nextQuestion) {
        setCurrentQuestion(response.nextQuestion);
        setChatHistory(prev => [...prev, { sender: 'bot', message: response.nextQuestion.question }]);
      } else {
        setCurrentQuestion(null);
        setChatHistory(prev => [...prev, { sender: 'bot', message: 'Thank you! We are now processing your complaint.' }]);
        // Auto-submit after showing final message
        setTimeout(() => {
          submitComplaint();
        }, 2000);
      }

      setCurrentAnswer(''); // Clear the input
    } catch (error) {
      console.error('Error sending follow-up answer:', error);
      toast({
        title: 'Failed to send answer',
        description: 'Please try again or contact support.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const submitComplaint = async () => {
    setIsProcessing(true);
    try {
      // Mock API call to submit complaint
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // If unpaid, increment complaint_count
      if (!hasSubscription) {
        const count = parseInt(localStorage.getItem('complaint_count') || '0', 10);
        localStorage.setItem('complaint_count', String(count + 1));
      }
      
      toast({
        title: "Complaint submitted!",
        description: "We're now working on your complaint. You'll be redirected to track progress.",
      });
      
      navigate(`/complaint/${complaintId}/actions`);
    } catch (error) {
      console.error('Error submitting complaint:', error);
      toast({
        title: "Submission failed",
        description: "Please try again or contact support.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const canSubmit = complaintText.trim() || uploadedImages.length > 0 || audioBlob;

  const renderInputStep = () => (
    <div className="space-y-6">
      <Card className="card-shadow border-0 stripe-gradient-subtle">
        <CardHeader>
          <CardTitle className="text-2xl">Tell us what happened</CardTitle>
          <CardDescription className="text-base">
            Describe your complaint using text, images, or voice recording
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Text Input */}
          <div className="space-y-2">
            <Label htmlFor="complaint-text" className="text-sm font-medium">
              Describe your complaint
            </Label>
            <div className="relative">
              <Textarea
                id="complaint-text"
                value={complaintText}
                onChange={(e) => setComplaintText(e.target.value)}
                placeholder="Tell us what happened in detail..."
                className="min-h-[120px] pr-20 resize-none border-2 focus:border-primary"
              />
              <div className="absolute bottom-3 right-3 flex space-x-2">
                {/* Paperclip for image upload */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-primary/10"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                </Button>
                
                {/* Microphone for audio recording */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={`h-8 w-8 ${isRecording ? 'recording-pulse' : 'hover:bg-primary/10'}`}
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  <Mic className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />

          {/* Recording status */}
          {isRecording && (
            <div className="flex items-center space-x-2 text-sm text-destructive">
              <div className="w-2 h-2 bg-destructive rounded-full animate-pulse"></div>
              <span>Recording... {formatDuration(audioDuration)}</span>
            </div>
          )}

          {/* Audio playback */}
          {audioBlob && (
            <div className="flex items-center space-x-3 p-3 bg-muted rounded-lg">
              <div className="flex-1 flex items-center space-x-2">
                <Mic className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Audio recording</span>
                <span className="text-xs text-muted-foreground">
                  {formatDuration(audioDuration)}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                onClick={deleteAudio}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Uploaded images */}
          {uploadedImages.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Uploaded images</Label>
              <div className="grid grid-cols-2 gap-3">
                {uploadedImages.map((image, index) => (
                  <div key={index} className="relative group">
                    <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
                      <Upload className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{image.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {(image.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeImage(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          <Button 
            onClick={processComplaint}
            disabled={isProcessing || !canSubmit}
            className="w-full h-12 text-base font-medium stripe-gradient hover:opacity-90 transition-opacity"
          >
            {isProcessing ? 'Processing...' : 'Analyze Complaint'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );

  const renderQuestionsStep = () => (
    <div className="space-y-6">
      <Card className="card-shadow border-0 stripe-gradient-subtle">
        <CardHeader>
          <CardTitle>Follow-up Questions</CardTitle>
          <CardDescription>
            Please answer the following questions to help us process your complaint.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Chat history */}
          <div className="bg-muted rounded-lg p-4 space-y-3 max-h-80 overflow-y-auto">
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.sender === 'bot' ? 'justify-start' : 'justify-end'}`}>
                <div 
                  className={`max-w-[80%] px-4 py-2 rounded-lg ${
                    msg.sender === 'bot' 
                      ? 'bg-primary/10 text-primary border border-primary/20' 
                      : 'bg-accent text-accent-foreground border border-accent/20'
                  }`}
                >
                  <p className="text-sm">{msg.message}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Answer input for current question */}
          {currentQuestion && (
            <div className="space-y-3">
              <div className="flex space-x-2">
                <Input 
                  value={currentAnswer}
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                  placeholder="Type your answer..." 
                  className="flex-1" 
                  disabled={isProcessing}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !isProcessing && currentAnswer.trim()) {
                      handleSendAnswer();
                    }
                  }}
                />
                <Button 
                  onClick={handleSendAnswer}
                  disabled={isProcessing || !currentAnswer.trim()}
                  className="px-4"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {/* Processing indicator */}
          {isProcessing && (
            <div className="flex items-center justify-center space-x-2 text-sm text-muted-foreground">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
              <span>Processing...</span>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  if (complaintLimitReached) {
    return (
      <Layout>
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
              File a New Complaint
            </h1>
            <p className="text-muted-foreground">
              We'll help you get your complaint resolved quickly and effectively
            </p>
          </div>
          <div className="p-4 bg-yellow-100 text-yellow-800 rounded text-center">
            You have reached your free complaint limit. Please pay to submit more complaints.
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary via-accent to-primary bg-clip-text text-transparent">
            File a New Complaint
          </h1>
          <p className="text-muted-foreground">
            We'll help you get your complaint resolved quickly and effectively
          </p>
        </div>

        {currentStep === 'input' && renderInputStep()}
        {currentStep === 'questions' && renderQuestionsStep()}
      </div>
    </Layout>
  );
};

export default NewComplaint;