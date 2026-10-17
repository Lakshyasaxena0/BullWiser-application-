
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCircle, AlertCircle, TrendingUp, Clock, ChevronLeft, Filter } from "lucide-react";
import { useLocation } from "wouter";

export default function ActivitiesPage() {
  const [, setLocation] = useLocation();
  const [filter, setFilter] = useState('all');

  const activities = [
    {
      id: 1,
      type: 'success',
      title: 'Prediction for SUZLON completed',
      description: 'Target price ₹54.20 achieved. Accuracy: 89.2%',
      time: '2 hours ago',
      icon: CheckCircle,
      iconColor: 'bg-green-500',
      details: 'Your prediction for SUZLON was highly accurate. The stock reached the target price of ₹54.20 with 89.2% accuracy. This was based on technical analysis and astrology bias of +3 points during Jupiter hora.',
      status: 'completed'
    },
    {
      id: 2,
      type: 'alert',
      title: 'Price alert triggered for TCS',
      description: 'Stock reached target price of ₹3,900',
      time: '5 hours ago',
      icon: AlertCircle,
      iconColor: 'bg-yellow-500',
      details: 'TCS reached your set alert price of ₹3,900. Current price: ₹3,905. Consider reviewing your position.',
      status: 'active'
    },
    {
      id: 3,
      type: 'prediction',
      title: 'New prediction generated for RELIANCE',
      description: 'Bullish trend detected. Confidence: 91.5%',
      time: '1 day ago',
      icon: TrendingUp,
      iconColor: 'bg-blue-500',
      details: 'AI detected a strong bullish pattern for RELIANCE with 91.5% confidence. Technical indicators show strong buy signals with +4 astrology bias during Venus hora.',
      status: 'active'
    },
    {
      id: 4,
      type: 'reminder',
      title: 'Subscription renewal reminder',
      description: 'Your premium plan expires in 15 days',
      time: '2 days ago',
      icon: Clock,
      iconColor: 'bg-purple-500',
      details: 'Your premium subscription will expire on December 25, 2024. Renew now to continue accessing premium features.',
      status: 'pending'
    },
    {
      id: 5,
      type: 'success',
      title: 'Portfolio performance milestone',
      description: 'Your portfolio gained 15% this month',
      time: '3 days ago',
      icon: CheckCircle,
      iconColor: 'bg-green-500',
      details: 'Congratulations! Your portfolio has achieved a 15% gain this month, outperforming the market by 8.2%.',
      status: 'completed'
    },
    {
      id: 6,
      type: 'alert',
      title: 'Stop loss triggered for HDFC',
      description: 'Position closed at ₹1,485',
      time: '5 days ago',
      icon: AlertCircle,
      iconColor: 'bg-red-500',
      details: 'Your stop loss order for HDFC was triggered at ₹1,485, limiting your loss to 3.2%.',
      status: 'completed'
    }
  ];

  const filteredActivities = filter === 'all' ? activities : activities.filter(activity => activity.type === filter);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge variant="secondary" className="bg-green-100 text-green-800">Completed</Badge>;
      case 'active':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-800">Active</Badge>;
      case 'pending':
        return <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation('/')}
            className="flex items-center"
            data-testid="button-back"
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Dashboard
          </Button>
          <div className="border-l pl-4">
            <h1 className="text-2xl font-bold text-gray-900" data-testid="text-page-title">Activity Center</h1>
            <p className="text-gray-600" data-testid="text-page-description">
              View all your trading activities and notifications
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          <Filter className="h-4 w-4 text-gray-500" />
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1 text-sm"
          >
            <option value="all">All Activities</option>
            <option value="success">Completed</option>
            <option value="alert">Alerts</option>
            <option value="prediction">Predictions</option>
            <option value="reminder">Reminders</option>
          </select>
        </div>
      </div>

      <Tabs defaultValue="timeline" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="timeline">Timeline View</TabsTrigger>
          <TabsTrigger value="summary">Summary View</TabsTrigger>
        </TabsList>
        
        <TabsContent value="timeline" className="space-y-4">
          {filteredActivities.map((activity) => {
            const IconComponent = activity.icon;
            
            return (
              <Card key={activity.id} className="hover:shadow-md transition-shadow">
                <CardContent className="p-6">
                  <div className="flex items-start space-x-4">
                    <div className={`w-12 h-12 ${activity.iconColor} rounded-full flex items-center justify-center flex-shrink-0`}>
                      <IconComponent className="h-6 w-6 text-white" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900" data-testid={`activity-title-${activity.id}`}>
                          {activity.title}
                        </h3>
                        {getStatusBadge(activity.status)}
                      </div>
                      <p className="text-gray-600 mb-2" data-testid={`activity-description-${activity.id}`}>
                        {activity.description}
                      </p>
                      <p className="text-gray-800 mb-3">
                        {activity.details}
                      </p>
                      <p className="text-sm text-gray-500" data-testid={`activity-time-${activity.id}`}>
                        {activity.time}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>
        
        <TabsContent value="summary" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">This Week</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">12</div>
                <p className="text-sm text-gray-600">Completed activities</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Active Alerts</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-blue-600">5</div>
                <p className="text-sm text-gray-600">Monitoring</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Success Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-purple-600">87%</div>
                <p className="text-sm text-gray-600">This month</p>
              </CardContent>
            </Card>
          </div>
          
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {activities.slice(0, 3).map((activity) => (
                  <div key={activity.id} className="flex items-center justify-between py-2 border-b last:border-b-0">
                    <div className="flex items-center space-x-3">
                      <div className={`w-8 h-8 ${activity.iconColor} rounded-full flex items-center justify-center`}>
                        <activity.icon className="h-4 w-4 text-white" />
                      </div>
                      <span className="font-medium">{activity.title}</span>
                    </div>
                    <span className="text-sm text-gray-500">{activity.time}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
