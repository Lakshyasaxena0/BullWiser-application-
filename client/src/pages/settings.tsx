import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { User, Settings, Bell, Shield, Trash2, Save, Camera, Lock, Key, Download, CheckCircle } from "lucide-react";

export default function SettingsPage() {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [profileForm, setProfileForm] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
    profileImageUrl: user?.profileImageUrl || "",
  });

  const [notificationSettings, setNotificationSettings] = useState({
    predictionAlerts: true,
    priceAlerts: false,
    marketUpdates: true,
    emailNotifications: true,
    pushNotifications: false,
  });

  const [privacySettings, setPrivacySettings] = useState({
    shareAnalytics: true,
    marketingEmails: false,
  });

  const [isEditing, setIsEditing] = useState(false);

  // Change password dialog
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  // 2FA dialog
  const [show2FADialog, setShow2FADialog] = useState(false);

  // Fetch real subscription data
  const { data: subscriptions } = useQuery<any[]>({
    queryKey: ["/api/user/subscriptions"],
    enabled: isAuthenticated,
  });

  const { data: predictions } = useQuery<any[]>({
    queryKey: ["/api/user/predictions"],
    enabled: isAuthenticated,
  });

  const activeSubscription = subscriptions?.find((s: any) => new Date(s.endTs * 1000) > new Date());

  useEffect(() => {
    if (user) {
      setProfileForm({
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        email: user.email || "",
        profileImageUrl: user.profileImageUrl || "",
      });
    }
  }, [user]);

  // Profile photo upload handler
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please choose an image under 5MB.", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setProfileForm(prev => ({ ...prev, profileImageUrl: base64 }));
      toast({ title: "Photo selected", description: "Click Save Changes to update your profile picture." });
    };
    reader.readAsDataURL(file);
  };

  // Profile update
  const updateProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", "/api/user/profile", data);
      return await res.json();
    },
    onSuccess: (updatedUser) => {
      queryClient.setQueryData(["/api/auth/user"], updatedUser);
      setIsEditing(false);
      toast({ title: "Profile updated", description: "Your profile has been successfully updated." });
    },
    onError: (error: Error) => {
      toast({ title: "Update failed", description: error.message, variant: "destructive" });
    },
  });

  // Change password
  const changePasswordMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest("PUT", "/api/user/password", data);
      return await res.json();
    },
    onSuccess: () => {
      setShowPasswordDialog(false);
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      toast({ title: "Password changed", description: "Your password has been updated successfully." });
    },
    onError: (error: Error) => {
      toast({ title: "Failed", description: error.message, variant: "destructive" });
    },
  });

  // Download data
  const downloadDataMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/user/export");
      return await res.json();
    },
    onSuccess: (data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bullwiser-data-${new Date().toISOString().split("T")[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Data downloaded", description: "Your data has been exported successfully." });
    },
    onError: () => {
      toast({ title: "Download failed", description: "Could not export your data. Try again.", variant: "destructive" });
    },
  });

  // Delete account
  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/user/account");
      return res;
    },
    onSuccess: () => {
      queryClient.clear();
      toast({ title: "Account deleted", description: "Your account has been permanently deleted." });
      window.location.href = "/auth";
    },
    onError: (error: Error) => {
      toast({ title: "Deletion failed", description: error.message, variant: "destructive" });
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(profileForm);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast({ title: "Passwords don't match", description: "New password and confirm password must match.", variant: "destructive" });
      return;
    }
    if (passwordForm.newPassword.length < 6) {
      toast({ title: "Password too short", description: "Password must be at least 6 characters.", variant: "destructive" });
      return;
    }
    changePasswordMutation.mutate({ currentPassword: passwordForm.currentPassword, newPassword: passwordForm.newPassword });
  };

  const getUserInitials = () => {
    if (user?.firstName && user?.lastName) return `${user.firstName[0]}${user.lastName[0]}`.toUpperCase();
    if (user?.email) return user.email.substring(0, 2).toUpperCase();
    return "U";
  };

  if (!isAuthenticated) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-96"><CardHeader><CardTitle>Access Denied</CardTitle><CardDescription>Please log in to access settings.</CardDescription></CardHeader></Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Settings</h1>
        <p className="text-gray-600">Manage your account preferences and privacy settings</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="profile"><User className="h-4 w-4 mr-1" />Profile</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="h-4 w-4 mr-1" />Notifications</TabsTrigger>
          <TabsTrigger value="privacy"><Shield className="h-4 w-4 mr-1" />Privacy</TabsTrigger>
          <TabsTrigger value="account"><Settings className="h-4 w-4 mr-1" />Account</TabsTrigger>
        </TabsList>

        {/* ── Profile Tab ────────────────────────────────────────────── */}
        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profile Information</CardTitle>
              <CardDescription>Update your personal information and profile picture</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Profile picture */}
              <div className="flex items-center space-x-6">
                <Avatar className="h-24 w-24">
                  <AvatarImage src={profileForm.profileImageUrl} alt="Profile" />
                  <AvatarFallback className="text-lg font-semibold bg-gradient-to-br from-purple-500 to-purple-600 text-white">
                    {getUserInitials()}
                  </AvatarFallback>
                </Avatar>
                <div className="space-y-2">
                  <Label>Profile Picture</Label>
                  <div className="flex items-center space-x-2">
                    {/* Hidden real file input */}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handlePhotoChange}
                    />
                    <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                      <Camera className="h-4 w-4 mr-2" />
                      Change Photo
                    </Button>
                    {profileForm.profileImageUrl && (
                      <Button variant="ghost" size="sm" onClick={() => setProfileForm(prev => ({ ...prev, profileImageUrl: "" }))}>
                        Remove
                      </Button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">JPG, PNG or GIF · max 5MB</p>
                </div>
              </div>

              <Separator />

              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input value={profileForm.firstName} onChange={e => setProfileForm(p => ({ ...p, firstName: e.target.value }))} disabled={!isEditing} placeholder="First name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input value={profileForm.lastName} onChange={e => setProfileForm(p => ({ ...p, lastName: e.target.value }))} disabled={!isEditing} placeholder="Last name" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email Address</Label>
                  <Input type="email" value={profileForm.email} onChange={e => setProfileForm(p => ({ ...p, email: e.target.value }))} disabled={!isEditing} placeholder="Email address" />
                </div>
                <div className="space-y-2">
                  <Label>Username</Label>
                  <Input value={user?.username || ""} disabled className="bg-gray-50" />
                  <p className="text-sm text-gray-500">Username cannot be changed</p>
                </div>
                <div className="flex justify-end space-x-3">
                  {isEditing ? (
                    <>
                      <Button type="button" variant="outline" onClick={() => setIsEditing(false)} disabled={updateProfileMutation.isPending}>Cancel</Button>
                      <Button type="submit" disabled={updateProfileMutation.isPending}>
                        <Save className="h-4 w-4 mr-2" />
                        {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
                      </Button>
                    </>
                  ) : (
                    <Button type="button" onClick={() => setIsEditing(true)}>Edit Profile</Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Notifications Tab ──────────────────────────────────────── */}
        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notification Preferences</CardTitle>
              <CardDescription>Choose how you want to be notified</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: "predictionAlerts", label: "Prediction Alerts", desc: "Get notified when predictions reach high confidence" },
                { key: "priceAlerts", label: "Price Alerts", desc: "Receive alerts when stocks hit target prices" },
                { key: "marketUpdates", label: "Market Updates", desc: "Stay informed about major market movements" },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between">
                  <div><Label>{item.label}</Label><p className="text-sm text-gray-500">{item.desc}</p></div>
                  <Switch
                    checked={notificationSettings[item.key as keyof typeof notificationSettings]}
                    onCheckedChange={checked => {
                      setNotificationSettings(p => ({ ...p, [item.key]: checked }));
                      toast({ title: `${item.label} ${checked ? "enabled" : "disabled"}` });
                    }}
                  />
                </div>
              ))}
              <Separator />
              {[
                { key: "emailNotifications", label: "Email Notifications", desc: "Receive notifications via email" },
                { key: "pushNotifications", label: "Push Notifications", desc: "Receive browser push notifications" },
              ].map(item => (
                <div key={item.key} className="flex items-center justify-between">
                  <div><Label>{item.label}</Label><p className="text-sm text-gray-500">{item.desc}</p></div>
                  <Switch
                    checked={notificationSettings[item.key as keyof typeof notificationSettings]}
                    onCheckedChange={checked => {
                      setNotificationSettings(p => ({ ...p, [item.key]: checked }));
                      toast({ title: `${item.label} ${checked ? "enabled" : "disabled"}` });
                    }}
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Privacy Tab ────────────────────────────────────────────── */}
        <TabsContent value="privacy">
          <Card>
            <CardHeader>
              <CardTitle>Privacy & Security</CardTitle>
              <CardDescription>Control your privacy settings and account security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div><Label>Share Analytics</Label><p className="text-sm text-gray-500">Help improve BullWiser by sharing anonymous usage data</p></div>
                  <Switch checked={privacySettings.shareAnalytics} onCheckedChange={checked => { setPrivacySettings(p => ({ ...p, shareAnalytics: checked })); toast({ title: `Analytics sharing ${checked ? "enabled" : "disabled"}` }); }} />
                </div>
                <div className="flex items-center justify-between">
                  <div><Label>Marketing Emails</Label><p className="text-sm text-gray-500">Receive promotional emails and feature updates</p></div>
                  <Switch checked={privacySettings.marketingEmails} onCheckedChange={checked => { setPrivacySettings(p => ({ ...p, marketingEmails: checked })); toast({ title: `Marketing emails ${checked ? "enabled" : "disabled"}` }); }} />
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="text-base font-medium">Security</Label>
                <div className="space-y-3">
                  {/* Change Password */}
                  <Button variant="outline" className="w-full justify-start" onClick={() => setShowPasswordDialog(true)}>
                    <Lock className="h-4 w-4 mr-2" />
                    Change Password
                  </Button>

                  {/* 2FA */}
                  <Button variant="outline" className="w-full justify-start" onClick={() => setShow2FADialog(true)}>
                    <Key className="h-4 w-4 mr-2" />
                    Two-Factor Authentication
                  </Button>

                  {/* Download Data */}
                  <Button variant="outline" className="w-full justify-start" onClick={() => downloadDataMutation.mutate()} disabled={downloadDataMutation.isPending}>
                    <Download className="h-4 w-4 mr-2" />
                    {downloadDataMutation.isPending ? "Preparing download..." : "Download My Data"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Account Tab ────────────────────────────────────────────── */}
        <TabsContent value="account">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Account Information</CardTitle>
                <CardDescription>Your account details and membership information</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Account Created</Label>
                    <p className="text-sm mt-1">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : "—"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Username</Label>
                    <p className="text-sm mt-1 font-medium">{user?.username || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Email</Label>
                    <p className="text-sm mt-1">{user?.email || "Not set"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Account Role</Label>
                    <p className="text-sm mt-1 capitalize">{user?.role || "user"}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Subscription Status</Label>
                    <div className="mt-1">
                      {activeSubscription ? (
                        <Badge className="bg-green-100 text-green-800">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Active — {activeSubscription.mode}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-gray-600">No active subscription</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-sm font-medium text-gray-500">Total Predictions</Label>
                    <p className="text-sm mt-1">{predictions?.length || 0} predictions made</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-red-200">
              <CardHeader>
                <CardTitle className="text-red-600">Danger Zone</CardTitle>
                <CardDescription>These actions are permanent and cannot be undone</CardDescription>
              </CardHeader>
              <CardContent>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full">
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Account
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete your account and all your data including predictions, watchlists and subscriptions. This cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => deleteAccountMutation.mutate()} className="bg-red-600 hover:bg-red-700 text-white" disabled={deleteAccountMutation.isPending}>
                        {deleteAccountMutation.isPending ? "Deleting..." : "Yes, Delete My Account"}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ── Change Password Dialog ─────────────────────────────────── */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>Enter your current password and choose a new one.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handlePasswordSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <PasswordInput placeholder="Enter current password" value={passwordForm.currentPassword} onChange={e => setPasswordForm(p => ({ ...p, currentPassword: e.target.value }))} required />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <PasswordInput placeholder="Min 6 characters" value={passwordForm.newPassword} onChange={e => setPasswordForm(p => ({ ...p, newPassword: e.target.value }))} required minLength={6} />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <PasswordInput placeholder="Re-enter new password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm(p => ({ ...p, confirmPassword: e.target.value }))} required minLength={6} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowPasswordDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={changePasswordMutation.isPending}>
                {changePasswordMutation.isPending ? "Updating..." : "Update Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── 2FA Dialog ────────────────────────────────────────────── */}
      <Dialog open={show2FADialog} onOpenChange={setShow2FADialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Two-Factor Authentication</DialogTitle>
            <DialogDescription>Add an extra layer of security to your account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm text-amber-800">2FA via authenticator app is coming soon. You'll be notified when it's available.</p>
            </div>
            <p className="text-sm text-gray-500">Currently your account is protected by your password. Keep it strong and unique.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => setShow2FADialog(false)}>Got it</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
