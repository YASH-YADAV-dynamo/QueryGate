import {
  CUSTOMER_ANALYTICS_WIDGET_HTML,
  CUSTOMER_ANALYTICS_WIDGET_URI,
} from "./customer-analytics-widget.js"

export interface WidgetResource {
  uri: string
  name: string
  description: string
  mimeType: string
  html: string
}

export const WIDGET_RESOURCES: WidgetResource[] = [
  {
    uri: CUSTOMER_ANALYTICS_WIDGET_URI,
    name: "customer-analytics-dashboard",
    description: "Tableau-style customer analytics dashboard for ChatGPT",
    mimeType: "text/html;profile=mcp-app",
    html: CUSTOMER_ANALYTICS_WIDGET_HTML,
  },
]

export function getWidgetByUri(uri: string): WidgetResource | undefined {
  return WIDGET_RESOURCES.find((w) => w.uri === uri)
}
