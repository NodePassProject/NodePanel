"use client";

import React, { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { AlertCircle, Info, ExternalLink } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription as ShadAlertDescription } from '@/components/ui/alert'; // Renamed to avoid conflict

export default function HelpPage() {
  const [appDomain, setAppDomain] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setAppDomain(window.location.origin);
    }
  }, []);

  return (
    <AppLayout>
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold font-title mb-2">Help and Instructions</h1>
          <p className="text-lg text-muted-foreground font-sans">
            Welcome to NodePanel! This page provides an overview of features, a user guide, and common troubleshooting.
          </p>
        </div>

        <Card className="shadow-lg card-hover-shadow">
          <CardHeader>
            <CardTitle className="font-title flex items-center">
              <Info size={22} className="mr-2 text-primary" />
              About NodePanel
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm font-sans">
            <p>
              NodePanel is a front-end management panel designed for the <a href="https://github.com/yosebyte/nodepass" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">NodePass</a> backend service. It provides a user-friendly interface to centrally manage your NodePass master connections, instances (server/client), visualize connection topology, and monitor traffic.
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-lg card-hover-shadow">
          <CardHeader>
            <CardTitle className="font-title">Main Features</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm font-sans">
            <ul className="list-disc list-outside pl-5 space-y-1">
              <li><strong>Master Connection Management:</strong> Add, edit, delete, and switch between multiple NodePass master configurations.</li>
              <li><strong>Instance Management:</strong> Create, start, stop, restart, modify, and delete NodePass instances.</li>
              <li><strong>Connection Topology Visualization:</strong> Design and display connection relationships between instances via drag-and-drop, and submit for creation with one click.</li>
              <li><strong>Traffic Statistics:</strong> View TCP and UDP traffic data for each instance.</li>
              <li><strong>Event Logs:</strong> Track important operations and status changes within the application.</li>
            </ul>
          </CardContent>
        </Card>

        <Card className="shadow-lg card-hover-shadow">
          <CardHeader>
            <CardTitle className="font-title">Basic Operation Procedures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm font-sans">
            <ol className="list-decimal list-outside pl-5 space-y-2">
              <li>
                <strong>Add Master Connection:</strong>
                <ul className="list-disc list-outside pl-6 mt-1">
                  <li>Click the <span className="font-semibold">Settings Icon</span> in the upper right corner of the page.</li>
                  <li>Select the add option under “Add New Master” or “Manage All Masters”.</li>
                  <li>Enter the master’s <span className="font-semibold">API Address</span> (e.g., `http://localhost:3000`) and <span className="font-semibold">Token (API Key)</span>.</li>
                  <li>(Optional) Configure the API prefix path, master default log level, and TLS mode for reference.</li>
                  <li>Save the configuration.</li>
                </ul>
              </li>
              <li>
                <strong>Select Active Master:</strong>
                <ul className="list-disc list-outside pl-6 mt-1">
                  <li>After adding at least one master, choose one as the current master for operations through the “Switch Active Master” option in the settings menu.</li>
                  <li>Or click the “Set as Active” button on the right side of the master entry on the “Manage All Masters” page.</li>
                </ul>
              </li>
              <li>
                <strong>Manage Instances:</strong>
                <ul className="list-disc list-outside pl-6 mt-1">
                  <li>On the <span className="font-semibold">Home</span> (Overview) page, you can see the list of instances under the current active master.</li>
                  <li>You can create new instances, start/stop/restart existing instances, view instance details and logs, modify instance configurations, or delete instances.</li>
                </ul>
              </li>
              <li>
                <strong>(Optional) Use Topology Map:</strong>
                <ul className="list-disc list-outside pl-6 mt-1">
                  <li>Navigate to the <span className="font-semibold">Connection Topology Map</span> page (via the settings menu).</li>
                  <li>Drag masters and components (server/client/landing) from the left panel onto the canvas.</li>
                  <li>Connect nodes to define link relationships. Node properties will update automatically or can be edited manually.</li>
                  <li>After completion, click “Submit Topology” to batch create instances on the respective masters.</li>
                </ul>
              </li>
              <li>
                <strong>(Optional) View Traffic Statistics:</strong>
                <ul className="list-disc list-outside pl-6 mt-1">
                  <li>Navigate to the <span className="font-semibold">Traffic Statistics</span> page (via the settings menu) to view traffic information for all instances under all configured masters.</li>
                </ul>
              </li>
            </ol>
          </CardContent>
        </Card>

        <Card className="shadow-lg card-hover-shadow">
          <CardHeader>
            <CardTitle className="font-title flex items-center">
              <AlertCircle size={22} className="mr-2 text-destructive" />
              Troubleshooting (Chrome Browser)
            </CardTitle>
            <CardDescription className="font-sans">
              If you encounter issues connecting to the NodePass master using Chrome browser, please refer to the following instructions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-sm font-sans">
            <Alert variant="default" className="bg-muted/30">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertTitle className="font-title text-base text-blue-700">HTTP Master Connection Issues (Mixed Content)</AlertTitle>
              <ShadAlertDescription className="mt-1 space-y-2">
                <p>
                  If your NodePass master API service is provided over <strong>HTTP (not HTTPS)</strong>, while NodePanel is accessed over HTTPS, the browser may block the connection.
                </p>
                <p className="font-semibold">Solution:</p>
                <ol className="list-decimal list-outside pl-5 space-y-1">
                  <li>
                    Enter in the Chrome address bar: <code className="bg-card p-1 rounded text-xs select-all">chrome://settings/content/siteDetails?site={appDomain || 'YOUR_APP_DOMAIN'}</code>
                    {appDomain && <span className="block text-xs text-muted-foreground">(The current app domain has been auto-filled)</span>}
                    {!appDomain && <span className="block text-xs text-muted-foreground">(Please replace YOUR_APP_DOMAIN with your current NodePanel app domain)</span>}
                  </li>
                  <li>Find the “<strong>Insecure Content</strong>” setting.</li>
                  <li>Change it to “<strong>Allow</strong>”.</li>
                  <li>Refresh this NodePanel page.</li>
                </ol>
              </ShadAlertDescription>
            </Alert>

            <Alert variant="default" className="bg-muted/30">
              <Info className="h-4 w-4 text-blue-600" />
              <AlertTitle className="font-title text-base text-blue-700">HTTPS (Self-signed Certificate) Master Connection Issues</AlertTitle>
              <ShadAlertDescription className="mt-1 space-y-2">
                <p>
                  If your NodePass master API service is provided over <strong>HTTPS</strong> but uses a <strong>self-signed certificate</strong>, the browser will block the connection.
                </p>
                <p className="font-semibold">Solution:</p>
                <ol className="list-decimal list-outside pl-5 space-y-1">
                  <li>
                    In a new browser tab, <strong>directly access your NodePass master API URL</strong>.
                    <span className="block text-xs text-muted-foreground">
                      (e.g., `https://your-nodepass-api.example.com:3000`)
                    </span>
                  </li>
                  <li>You will see a security warning page. Click “<strong>Advanced</strong>”.</li>
                  <li>
                    Click “<strong>Proceed to {<em>Master API Domain</em>} (unsafe)</strong>”.
                  </li>
                  <li>After accepting the certificate, return to this NodePanel page and refresh.</li>
                </ol>
              </ShadAlertDescription>
            </Alert>
          </CardContent>
        </Card>

         <Card className="shadow-lg card-hover-shadow">
          <CardHeader>
            <CardTitle className="font-title">Contact and Support</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm font-sans">
            <p>
              If you encounter other problems or have feature suggestions, please feel free to contact or report via the following methods:
            </p>
            <ul className="list-disc list-outside pl-5">
              <li>
                NodePass (backend) related issues: <a href="https://github.com/yosebyte/nodepass/issues" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">NodePass GitHub Issues <ExternalLink size={14} className="inline-block ml-0.5" /></a>
              </li>
              <li>
                NodePanel (this frontend) related issues: <a href="https://github.com/MK85Pilot/nodepass-panel/issues" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">NodePass Panel GitHub Issues <ExternalLink size={14} className="inline-block ml-0.5" /></a>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}