import extractMeta from "./data/extract-meta.json";

/** What each dataset is, where it comes from, and what it can't tell us. Shown on /data-sources. */
export type DataSource = {
  name: string;
  publisher: string;
  url: string;
  refresh: string;
  contributes: string;
  limitations: string;
};

const portal = (slug: string) => `https://open.toronto.ca/dataset/${slug}/`;

export const DATA_EXTRACTED_AT: string = extractMeta.extractedAt;

export const SAFETY_DISCLAIMER =
  "Historical safety data does not guarantee current safety and is used only as contextual information.";

export const DATA_SOURCES: DataSource[] = [
  {
    name: "TTC Routes and Schedules (GTFS)",
    publisher: "Toronto Transit Commission, via City of Toronto Open Data",
    url: portal("ttc-routes-and-schedules"),
    refresh: "Monthly",
    contributes: "Subway stations, surface stops, and subway/streetcar lines near the route, used for \"TTC access\".",
    limitations: "Scheduled service only. It doesn't show crowding, elevator outages, or live delays.",
  },
  {
    name: "TTC service disruptions (demo feed)",
    publisher: "Local mock feed in the Huddle app (real source: TTC GTFS-Realtime)",
    url: portal("ttc-gtfs-realtime-gtfs-rt"),
    refresh: "Real-time in production; static in this prototype",
    contributes: "The \"current transit disruption\" used in route recommendations.",
    limitations: "The prototype shows a scripted disruption at St. George Station. It is not live TTC data.",
  },
  {
    name: "Pedestrian Network",
    publisher: "City of Toronto, Information & Technology",
    url: portal("pedestrian-network"),
    refresh: "As available",
    contributes: "Which route segments have a sidewalk or city walkway, across Toronto.",
    limitations: "Snapshot data. Construction closures and winter conditions aren't included.",
  },
  {
    name: "Toronto Centreline (TCL)",
    publisher: "City of Toronto, Information & Technology",
    url: portal("toronto-centreline-tcl"),
    refresh: "Daily",
    contributes: "Street names and types across Toronto.",
    limitations: "Street geometry only. It says nothing about lighting, traffic, or activity on a street.",
  },
  {
    name: "Library Branch General Information",
    publisher: "Toronto Public Library",
    url: portal("library-branch-general-information"),
    refresh: "Annually",
    contributes: "Public library branches as public support points.",
    limitations: "Opening hours change; the map doesn't confirm a branch is open right now.",
  },
  {
    name: "Parks and Recreation Facilities",
    publisher: "City of Toronto, Parks, Forestry & Recreation",
    url: portal("parks-and-recreation-facilities"),
    refresh: "Monthly",
    contributes: "Community centres and parks as public support points.",
    limitations: "Community centres are sparse downtown; the nearest may be over 1 km from the route.",
  },
  {
    name: "Washroom Facilities",
    publisher: "City of Toronto, Parks, Forestry & Recreation",
    url: portal("washroom-facilities"),
    refresh: "Daily",
    contributes: "Public washrooms, with open/closed status at the time of extraction.",
    limitations: "Status is from when the data was bundled, not live.",
  },
  {
    name: "School Locations (all types)",
    publisher: "Toronto Police Service, via City of Toronto Open Data",
    url: portal("school-locations-all-types"),
    refresh: "As available",
    contributes: "Schools and university buildings as recognisable public places.",
    limitations: "Buildings may be closed outside school hours.",
  },
  {
    name: "Police Facility Locations",
    publisher: "Toronto Police Service",
    url: portal("police-facility-locations"),
    refresh: "As available",
    contributes: "Police divisions and headquarters as public support points.",
    limitations: "Front-desk hours vary. For emergencies, call 911.",
  },
  {
    name: "Hospitals (OpenStreetMap)",
    publisher: "OpenStreetMap contributors (ODbL)",
    url: "https://www.openstreetmap.org/",
    refresh: "Community-maintained; extracted once for this prototype",
    contributes: "Hospitals near the route. They aren't on the Toronto portal.",
    limitations: "Community-edited data. Emergency departments aren't distinguished.",
  },
];
