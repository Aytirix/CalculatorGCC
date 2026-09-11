import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
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
import MyProjects from '@/pages/MyProjects/MyProjects';
import AdminLogin from '@/pages/Admin/AdminLogin';
import NotConfigured from '@/pages/NotConfigured/NotConfigured';
import OriginWarning from '@/components/OriginWarning/OriginWarning';
import { OriginStatusContext } from '@/contexts/OriginStatusContext';
import AdminPanel from '@/pages/Admin/AdminPanel';
import AccountSettings from '@/pages/AccountSettings/AccountSettings';
import PrivacyGate from '@/components/PrivacyChoiceModal/PrivacyGate';
import GithubLink from '@/components/GithubLink/GithubLink';
import { useSetupCheck } from '@/hooks/useSetupCheck';
import { useViewingUser } from '@/contexts/useViewingUser';

const AppRoutes: React.FC = () => {
	const { isAuthenticated } = useAuth();
	const { isConfigured, isChecking, originAllowed } = useSetupCheck();
	// `useLocation` et NON `window.location` : cette dernière n'est pas réactive.
	// Le composant ne s'abonnait donc à aucun changement de route, et après la
	// redirection ci-dessous plus rien ne le re-rendait — il restait figé sur un
	// `<Navigate>` déjà consommé, qui ne rend rien. Écran noir.
	const location = useLocation();
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

	// Pas encore configurée : on l'ANNONCE au lieu de rediriger.
	//
	// Rediriger vers /admin/login envoyait tout visiteur sur un formulaire de token
	// console, sans jamais dire pourquoi — incompréhensible pour qui n'administre
	// pas le site, et sans issue pour lui. L'écran d'information explique la
	// situation et laisse le bouton vers le panneau à qui saura s'en servir.
	//
	// `/admin/*` est épargné, sans quoi on masquerait le panneau qui sert justement
	// à sortir de cet état.
	if (isConfigured === false && !location.pathname.startsWith('/admin')) {
		return <NotConfigured />;
	}

	// Adresse non déclarée sur le serveur qui traite la connexion 42 : on AVERTIT,
	// on ne coupe pas.
	//
	// Un écran plein a été livré ici, puis retiré en audit : il suffisait qu'un
	// miroir soit servi sur un port ou un schéma différent de son APP_DOMAIN pour
	// que tout le site s'éteigne, alors que seule la connexion était cassée. Le
	// bandeau dit la même chose sans rien casser, et couvre en plus les visiteurs
	// connectés, que l'écran plein épargnait — or ce sont eux qui subissent la
	// redirection silencieuse en se reconnectant.
	//
	// `false` STRICT : `null` veut dire « on ne sait pas » (réseau muet, instance
	// antérieure à ce contrôle, ou instance qui ne fait pas autorité).
	return (
		<OriginStatusContext.Provider value={{ originAllowed }}>
			{originAllowed === false && <OriginWarning />}
			<PrivacyGate />
			<GithubLink />
			<Routes>
				{/* Accès admin autonome (token console, hors OAuth 42) */}
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
				path="/my-projects"
				element={
					<ProtectedRoute>
						<MyProjects key={viewKey} />
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
		</OriginStatusContext.Provider>
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
