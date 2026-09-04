import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { TourProvider } from '@/contexts/TourContext';
import { ViewingUserProvider } from '@/contexts/ViewingUserContext';
import { RefreshProvider } from '@/contexts/RefreshContext';
import { ChangelogProvider } from '@/contexts/ChangelogContext';
import { ProjectTeamsProvider } from '@/contexts/ProjectTeamsContext';
import { RncpDataProvider } from '@/contexts/RncpDataContext';
import ProtectedRoute from '@/components/ProtectedRoute/ProtectedRoute';
import Login from '@/pages/Login/Login';
import Callback from '@/pages/Callback/Callback';
import Dashboard from '@/pages/Dashboard/Dashboard';
import ProfessionalExperience from '@/pages/ProfessionalExperience/ProfessionalExperience';
import Calendar from '@/pages/Calendar/Calendar';
import ApiUsage from '@/pages/ApiUsage/ApiUsage';
import HolyGraph from '@/pages/HolyGraph/HolyGraph';
import Setup from '@/pages/Setup/Setup';
import AdminLogin from '@/pages/Admin/AdminLogin';
import AdminPanel from '@/pages/Admin/AdminPanel';
import AccountSettings from '@/pages/AccountSettings/AccountSettings';
import PrivacyGate from '@/components/PrivacyChoiceModal/PrivacyGate';
import GithubLink from '@/components/GithubLink/GithubLink';
import { useSetupCheck } from '@/hooks/useSetupCheck';
import { useViewingUser } from '@/contexts/useViewingUser';

const AppRoutes: React.FC = () => {
	const { isAuthenticated } = useAuth();
	const { isConfigured, isChecking } = useSetupCheck();
	const { viewingUser } = useViewingUser();
	const viewKey = viewingUser?.userId42 ?? 'self';

	// Affiche un écran de chargement pendant la vérification de la configuration
	if (isChecking) {
		return (
			<div style={{
				display: 'flex',
				justifyContent: 'center',
				alignItems: 'center',
				height: '100vh'
			}}>
				<p>Loading...</p>
			</div>
		);
	}

	// Si non configuré, tout mène au bootstrap admin autonome (token console affiché au
	// démarrage, puis passkey) : c'est la seule voie de configuration initiale depuis le
	// retrait de /setup localhost. On ne redirige évidemment pas /admin* sur lui-même.
	if (isConfigured === false && !window.location.pathname.startsWith('/admin')) {
		return <Navigate to="/admin/login" replace />;
	}

	return (
		<>
			<PrivacyGate />
			<GithubLink />
			<Routes>
				{/* Route de setup - accessible à tous */}
				<Route path="/setup" element={<Setup />} />

				{/* Accès admin autonome (auth passkey / token console, hors OAuth 42) */}
				<Route path="/admin/login" element={<AdminLogin />} />
				<Route path="/admin" element={<AdminPanel />} />

			<Route
				path="/"
				element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <Login />}
			/>
			<Route path="/callback" element={<Callback />} />
			<Route
				path="/dashboard"
				element={
					<ProtectedRoute>
						<Dashboard key={viewKey} />
					</ProtectedRoute>
				}
			/>
			<Route
				path="/professional-experience"
				element={
					<ProtectedRoute>
						<ProfessionalExperience key={viewKey} />
					</ProtectedRoute>
				}
			/>
			<Route
				path="/calendar"
				element={
					<ProtectedRoute>
						<Calendar key={viewKey} />
					</ProtectedRoute>
				}
			/>
			<Route
				path="/holy-graph"
				element={
					<ProtectedRoute>
						<HolyGraph key={viewKey} />
					</ProtectedRoute>
				}
			/>
			<Route
				path="/api-usage"
				element={
					<ProtectedRoute>
						<ApiUsage />
					</ProtectedRoute>
				}
			/>
			<Route
				path="/settings"
				element={
					<ProtectedRoute>
						<AccountSettings />
					</ProtectedRoute>
				}
			/>
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
		</>
	);
};

function App() {
	return (
		<ThemeProvider>
			<AuthProvider>
				<TourProvider>
					<ViewingUserProvider>
						<RefreshProvider>
							<ChangelogProvider>
								<ProjectTeamsProvider>
									<RncpDataProvider>
										<Router>
											<AppRoutes />
										</Router>
									</RncpDataProvider>
								</ProjectTeamsProvider>
							</ChangelogProvider>
						</RefreshProvider>
					</ViewingUserProvider>
				</TourProvider>
			</AuthProvider>
		</ThemeProvider>
	);
}

export default App;
