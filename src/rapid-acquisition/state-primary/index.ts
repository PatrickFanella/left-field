import type { StatePrimaryAdapter } from "../state-primary-results-2026";
import { ALASKA_PRIMARY } from "./alaska";
import { ALABAMA_PRIMARY } from "./alabama";
import { ARKANSAS_PRIMARY } from "./arkansas";
import { ARIZONA_PRIMARY } from "./arizona";
import { CALIFORNIA_PRIMARY } from "./california";
import { COLORADO_PRIMARY } from "./colorado";
import { CONNECTICUT_PRIMARY } from "./connecticut";
import { DISTRICT_OF_COLUMBIA_PRIMARY } from "./district-of-columbia";
import { DELAWARE_PRIMARY } from "./delaware";
import { FLORIDA_PRIMARY } from "./florida";
import { GEORGIA_PRIMARY } from "./georgia";
import { HAWAII_PRIMARY } from "./hawaii";
import { IOWA_PRIMARY } from "./iowa";
import { IDAHO_PRIMARY } from "./idaho";
import { ILLINOIS_PRIMARY } from "./illinois";
import { INDIANA_PRIMARY } from "./indiana";
import { KANSAS_PRIMARY } from "./kansas";
import { KENTUCKY_PRIMARY } from "./kentucky";
import { LOUISIANA_PRIMARY } from "./louisiana";
import { MASSACHUSETTS_PRIMARY } from "./massachusetts";
import { MARYLAND_PRIMARY } from "./maryland";
import { MAINE_PRIMARY } from "./maine";
import { MICHIGAN_PRIMARY } from "./michigan";
import { MINNESOTA_PRIMARY } from "./minnesota";
import { MISSOURI_PRIMARY } from "./missouri";
import { MISSISSIPPI_PRIMARY } from "./mississippi";
import { MONTANA_PRIMARY } from "./montana";
import { NORTH_CAROLINA_PRIMARY } from "./north-carolina";
import { NORTH_DAKOTA_PRIMARY } from "./north-dakota";
import { NEBRASKA_PRIMARY } from "./nebraska";
import { NEW_HAMPSHIRE_PRIMARY } from "./new-hampshire";
import { NEW_JERSEY_PRIMARY } from "./new-jersey";
import { NEW_MEXICO_PRIMARY } from "./new-mexico";
import { NEVADA_PRIMARY } from "./nevada";
import { NEW_YORK_PRIMARY } from "./new-york";
import { OHIO_PRIMARY } from "./ohio";
import { OKLAHOMA_PRIMARY } from "./oklahoma";
import { OREGON_PRIMARY } from "./oregon";
import { PENNSYLVANIA_PRIMARY } from "./pennsylvania";
import { RHODE_ISLAND_PRIMARY } from "./rhode-island";
import { SOUTH_CAROLINA_PRIMARY } from "./south-carolina";
import { SOUTH_DAKOTA_PRIMARY } from "./south-dakota";
import { TENNESSEE_PRIMARY } from "./tennessee";
import { TEXAS_PRIMARY } from "./texas";
import { UTAH_PRIMARY } from "./utah";
import { VIRGINIA_PRIMARY } from "./virginia";
import { VERMONT_PRIMARY } from "./vermont";
import { WASHINGTON_PRIMARY } from "./washington";
import { WISCONSIN_PRIMARY } from "./wisconsin";
import { WEST_VIRGINIA_PRIMARY } from "./west-virginia";
import { WYOMING_PRIMARY } from "./wyoming";

/**
 * One adapter per state. Each reads that state's retained official 2026
 * primary returns and reports raw contests; normalization and count checks
 * live in state-primary-results-2026.ts. An adapter with no sources yet is
 * left out of the build.
 */
export const STATE_PRIMARY_ADAPTERS: readonly StatePrimaryAdapter[] = [
  ALASKA_PRIMARY,
  ALABAMA_PRIMARY,
  ARKANSAS_PRIMARY,
  ARIZONA_PRIMARY,
  CALIFORNIA_PRIMARY,
  COLORADO_PRIMARY,
  CONNECTICUT_PRIMARY,
  DISTRICT_OF_COLUMBIA_PRIMARY,
  DELAWARE_PRIMARY,
  FLORIDA_PRIMARY,
  GEORGIA_PRIMARY,
  HAWAII_PRIMARY,
  IOWA_PRIMARY,
  IDAHO_PRIMARY,
  ILLINOIS_PRIMARY,
  INDIANA_PRIMARY,
  KANSAS_PRIMARY,
  KENTUCKY_PRIMARY,
  LOUISIANA_PRIMARY,
  MASSACHUSETTS_PRIMARY,
  MARYLAND_PRIMARY,
  MAINE_PRIMARY,
  MICHIGAN_PRIMARY,
  MINNESOTA_PRIMARY,
  MISSOURI_PRIMARY,
  MISSISSIPPI_PRIMARY,
  MONTANA_PRIMARY,
  NORTH_CAROLINA_PRIMARY,
  NORTH_DAKOTA_PRIMARY,
  NEBRASKA_PRIMARY,
  NEW_HAMPSHIRE_PRIMARY,
  NEW_JERSEY_PRIMARY,
  NEW_MEXICO_PRIMARY,
  NEVADA_PRIMARY,
  NEW_YORK_PRIMARY,
  OHIO_PRIMARY,
  OKLAHOMA_PRIMARY,
  OREGON_PRIMARY,
  PENNSYLVANIA_PRIMARY,
  RHODE_ISLAND_PRIMARY,
  SOUTH_CAROLINA_PRIMARY,
  SOUTH_DAKOTA_PRIMARY,
  TENNESSEE_PRIMARY,
  TEXAS_PRIMARY,
  UTAH_PRIMARY,
  VIRGINIA_PRIMARY,
  VERMONT_PRIMARY,
  WASHINGTON_PRIMARY,
  WISCONSIN_PRIMARY,
  WEST_VIRGINIA_PRIMARY,
  WYOMING_PRIMARY,
];
