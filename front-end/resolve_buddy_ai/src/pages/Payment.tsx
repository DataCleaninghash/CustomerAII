
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ArrowLeft } from 'lucide-react';

const paymentMethods = [
  {
    id: 'card',
    name: 'Credit/Debit Card',
    description: 'Visa, Mastercard, American Express'
  },
  {
    id: 'googlepay',
    name: 'Google Pay',
    description: 'Pay with your Google account'
  },
  {
    id: 'upi',
    name: 'UPI',
    description: 'Unified Payments Interface'
  },
  {
    id: 'paypal',
    name: 'PayPal',
    description: 'Pay with your PayPal account'
  },
  {
    id: 'applepay',
    name: 'Apple Pay',
    description: 'Pay with Touch ID or Face ID'
  }
];

const planDetails = {
  basic: { name: 'Basic', price: '$9.99', period: 'month' },
  premium: { name: 'Premium', price: '$19.99', period: 'month' },
  enterprise: { name: 'Enterprise', price: '$49.99', period: 'month' }
};

const Payment = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const planId = searchParams.get('plan') as keyof typeof planDetails;
  const [selectedPayment, setSelectedPayment] = useState('card');
  const [isProcessing, setIsProcessing] = useState(false);

  const plan = planDetails[planId];

  useEffect(() => {
    if (!plan) {
      navigate('/pricing');
    }
  }, [plan, navigate]);

  const handlePayment = async () => {
    setIsProcessing(true);
    // Simulate payment processing
    setTimeout(() => {
      setIsProcessing(false);
      navigate('/dashboard');
    }, 2000);
  };

  if (!plan) {
    return null;
  }

  return (
    <div className="min-h-screen stripe-gradient-subtle">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Button 
          variant="ghost" 
          onClick={() => navigate('/pricing')}
          className="mb-6"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Pricing
        </Button>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Order Summary */}
          <Card className="card-shadow">
            <CardHeader>
              <CardTitle>Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="font-semibold">{plan.name} Plan</span>
                <span className="font-bold">{plan.price}/{plan.period}</span>
              </div>
              <div className="border-t pt-4">
                <div className="flex justify-between items-center text-lg font-bold">
                  <span>Total</span>
                  <span>{plan.price}/{plan.period}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-2">
                  7-day free trial included. You'll be charged after the trial period.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Payment Methods */}
          <Card className="card-shadow">
            <CardHeader>
              <CardTitle>Payment Method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup value={selectedPayment} onValueChange={setSelectedPayment}>
                {paymentMethods.map((method) => (
                  <div key={method.id} className="flex items-center space-x-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <RadioGroupItem value={method.id} id={method.id} />
                    <div className="flex-1">
                      <Label htmlFor={method.id} className="font-semibold cursor-pointer">
                        {method.name}
                      </Label>
                      <p className="text-sm text-muted-foreground">{method.description}</p>
                    </div>
                  </div>
                ))}
              </RadioGroup>

              {/* Card Details Form (shown when card is selected) */}
              {selectedPayment === 'card' && (
                <div className="space-y-4 p-4 bg-muted/30 rounded-lg">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cardNumber">Card Number</Label>
                      <Input id="cardNumber" placeholder="1234 5678 9012 3456" />
                    </div>
                    <div>
                      <Label htmlFor="expiryDate">Expiry Date</Label>
                      <Input id="expiryDate" placeholder="MM/YY" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="cvv">CVV</Label>
                      <Input id="cvv" placeholder="123" />
                    </div>
                    <div>
                      <Label htmlFor="cardName">Cardholder Name</Label>
                      <Input id="cardName" placeholder="John Doe" />
                    </div>
                  </div>
                </div>
              )}

              <Button 
                onClick={handlePayment}
                disabled={isProcessing}
                className="w-full stripe-gradient text-white hover:opacity-90"
                size="lg"
              >
                {isProcessing ? 'Processing...' : `Start Free Trial`}
              </Button>

              <p className="text-xs text-muted-foreground text-center">
                By continuing, you agree to our Terms of Service and Privacy Policy. 
                Your subscription will start after the 7-day free trial.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Payment;
