import ReactDOM from "react-dom/client";

const root = document.getElementById("root");

ReactDOM.createRoot(root).render(
  <BrowserRouter>
    <Routes>
      <Route path="/">
        <Route index element={<DashboardHome />} />
        <Route path=":project-id" />
        <Route index element={<ProjectMonitor />} />
        <Route path="manual" element={<ManualScaling />} />
        <Route path="ml" element={<MLComp />} />
      </Route>
      <Route path="auth" element={<AuthenticationPage />} />
      <Route path="create" element={<NewProject />} />
      <Route path="account" element={<Account />} />
      <Route path="settings" element={<Settings />} />
    </Routes>
  </BrowserRouter >
);
