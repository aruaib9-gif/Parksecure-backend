import React from 'react';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../context/AuthContext';
import { colors } from '../lib/theme';
import { Loading } from '../components/ui';

// Auth
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
// Staff
import DashboardScreen from '../screens/DashboardScreen';
import ScannerScreen from '../screens/ScannerScreen';
import ExitApprovalsScreen from '../screens/ExitApprovalsScreen';
import MoreScreen from '../screens/MoreScreen';
import VehiclesScreen from '../screens/VehiclesScreen';
import VehicleFormScreen from '../screens/VehicleFormScreen';
import QRCodesScreen from '../screens/QRCodesScreen';
import ScanLogsScreen from '../screens/ScanLogsScreen';
import PaymentsScreen from '../screens/PaymentsScreen';
import SecurityAlertsScreen from '../screens/SecurityAlertsScreen';
import ItemsLogScreen from '../screens/ItemsLogScreen';
import ShiftHandoverScreen from '../screens/ShiftHandoverScreen';
import UsersScreen from '../screens/UsersScreen';
import FacilitiesScreen from '../screens/FacilitiesScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SyncStatusScreen from '../screens/SyncStatusScreen';
// Owner
import OwnerHomeScreen from '../screens/OwnerHomeScreen';
import OwnerApprovalsScreen from '../screens/OwnerApprovalsScreen';
import OwnerBillsScreen from '../screens/OwnerBillsScreen';
import OwnerVehicleFormScreen from '../screens/OwnerVehicleFormScreen';

const Stack = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.bg, primary: colors.primary },
};

const tabIcons = {
  Dashboard: 'grid-outline',
  Scanner: 'qr-code-outline',
  Approvals: 'checkmark-done-outline',
  More: 'menu-outline',
  'My Vehicles': 'car-outline',
  Bills: 'card-outline',
  Settings: 'settings-outline',
};

const tabOptions = ({ route }) => ({
  headerShown: true,
  headerTitleStyle: { fontWeight: '700', color: colors.text },
  headerStyle: { backgroundColor: colors.card },
  tabBarActiveTintColor: colors.primary,
  tabBarInactiveTintColor: colors.textLight,
  tabBarIcon: ({ color, size }) => (
    <Ionicons name={tabIcons[route.name] || 'ellipse-outline'} size={size} color={color} />
  ),
});

function StaffTabs() {
  const { user } = useAuth();
  const canScan = ['security', 'facility_admin', 'park_admin', 'super_admin'].includes(user.role);
  return (
    <Tabs.Navigator screenOptions={tabOptions}>
      <Tabs.Screen name="Dashboard" component={DashboardScreen} />
      {canScan && <Tabs.Screen name="Scanner" component={ScannerScreen} />}
      <Tabs.Screen name="Approvals" component={ExitApprovalsScreen} options={{ title: 'Exit Approvals' }} />
      <Tabs.Screen name="More" component={MoreScreen} />
    </Tabs.Navigator>
  );
}

function OwnerTabs() {
  return (
    <Tabs.Navigator screenOptions={tabOptions}>
      <Tabs.Screen name="My Vehicles" component={OwnerHomeScreen} />
      <Tabs.Screen name="Approvals" component={OwnerApprovalsScreen} options={{ title: 'Exit Requests' }} />
      <Tabs.Screen name="Bills" component={OwnerBillsScreen} />
      <Tabs.Screen name="Settings" component={SettingsScreen} />
    </Tabs.Navigator>
  );
}

const stackScreenOptions = {
  headerTitleStyle: { fontWeight: '700', color: colors.text },
  headerStyle: { backgroundColor: colors.card },
  headerTintColor: colors.primary,
};

export default function RootNavigator() {
  const { user, isLoading, isStaff } = useAuth();
  if (isLoading) return <Loading />;
  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator screenOptions={stackScreenOptions}>
        {!user ? (
          <>
            <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
            <Stack.Screen name="Register" component={RegisterScreen} options={{ title: 'Create Account' }} />
          </>
        ) : isStaff ? (
          <>
            <Stack.Screen name="Main" component={StaffTabs} options={{ headerShown: false }} />
            <Stack.Screen name="Vehicles" component={VehiclesScreen} />
            <Stack.Screen name="VehicleForm" component={VehicleFormScreen} options={{ title: 'Vehicle' }} />
            <Stack.Screen name="QRCodes" component={QRCodesScreen} options={{ title: 'QR Codes' }} />
            <Stack.Screen name="ScanLogs" component={ScanLogsScreen} options={{ title: 'Scan Logs' }} />
            <Stack.Screen name="Payments" component={PaymentsScreen} />
            <Stack.Screen name="SecurityAlerts" component={SecurityAlertsScreen} options={{ title: 'Security Alerts' }} />
            <Stack.Screen name="ItemsLog" component={ItemsLogScreen} options={{ title: 'Items Log' }} />
            <Stack.Screen name="ShiftHandover" component={ShiftHandoverScreen} options={{ title: 'Shift Handover' }} />
            <Stack.Screen name="Users" component={UsersScreen} />
            <Stack.Screen name="Facilities" component={FacilitiesScreen} />
            <Stack.Screen name="Settings" component={SettingsScreen} />
            <Stack.Screen name="SyncStatus" component={SyncStatusScreen} options={{ title: 'Offline Sync' }} />
          </>
        ) : (
          <>
            <Stack.Screen name="OwnerMain" component={OwnerTabs} options={{ headerShown: false }} />
            <Stack.Screen name="OwnerVehicleForm" component={OwnerVehicleFormScreen} options={{ title: 'Register Vehicle' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
