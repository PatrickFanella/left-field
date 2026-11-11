import { NEW_HAMPSHIRE_GENERAL } from "./new-hampshire";
import { LOUISIANA_GENERAL } from "./louisiana";
import { DISTRICT_OF_COLUMBIA_GENERAL } from "./district-of-columbia";
import type { StateGeneralAdapter } from "../state-legislative-general-results";
import { NEBRASKA_GENERAL } from "./nebraska";
import { MISSISSIPPI_GENERAL } from "./mississippi";
import { OKLAHOMA_GENERAL } from "./oklahoma";
import { ALABAMA_GENERAL } from "./alabama";
import { ALASKA_GENERAL } from "./alaska";
import { ARIZONA_GENERAL } from "./arizona";
import { ARKANSAS_GENERAL } from "./arkansas";
import { CALIFORNIA_GENERAL } from "./california";
import { COLORADO_GENERAL } from "./colorado";
import { CONNECTICUT_GENERAL } from "./connecticut";
import { DELAWARE_GENERAL } from "./delaware";
import { FLORIDA_GENERAL } from "./florida";
import { GEORGIA_GENERAL } from "./georgia";
import { HAWAII_GENERAL } from "./hawaii";
import { IDAHO_GENERAL } from "./idaho";
import { ILLINOIS_GENERAL } from "./illinois";
import { INDIANA_GENERAL } from "./indiana";
import { IOWA_GENERAL } from "./iowa";
import { KANSAS_GENERAL } from "./kansas";
import { KENTUCKY_GENERAL } from "./kentucky";
import { MAINE_GENERAL } from "./maine";
import { MARYLAND_GENERAL } from "./maryland";
import { MASSACHUSETTS_GENERAL } from "./massachusetts";
import { MICHIGAN_GENERAL } from "./michigan";
import { MINNESOTA_GENERAL } from "./minnesota";
import { MISSOURI_GENERAL } from "./missouri";
import { MONTANA_GENERAL } from "./montana";
import { NEVADA_GENERAL } from "./nevada";
import { NEW_JERSEY_GENERAL } from "./new-jersey";
import { NEW_MEXICO_GENERAL } from "./new-mexico";
import { NEW_YORK_GENERAL } from "./new-york";
import { NORTH_CAROLINA_GENERAL } from "./north-carolina";
import { NORTH_DAKOTA_GENERAL } from "./north-dakota";
import { OHIO_GENERAL } from "./ohio";
import { OREGON_GENERAL } from "./oregon";
import { PENNSYLVANIA_GENERAL } from "./pennsylvania";
import { RHODE_ISLAND_GENERAL } from "./rhode-island";
import { SOUTH_CAROLINA_GENERAL } from "./south-carolina";
import { SOUTH_DAKOTA_GENERAL } from "./south-dakota";
import { TENNESSEE_GENERAL } from "./tennessee";
import { TEXAS_GENERAL } from "./texas";
import { UTAH_GENERAL } from "./utah";
import { VERMONT_GENERAL } from "./vermont";
import { VIRGINIA_GENERAL } from "./virginia";
import { WASHINGTON_GENERAL } from "./washington";
import { WEST_VIRGINIA_GENERAL } from "./west-virginia";
import { WISCONSIN_GENERAL } from "./wisconsin";
import { WYOMING_GENERAL } from "./wyoming";

/**
 * One adapter per covered state. Each reads that state's retained official
 * general-election returns and reports raw contests; normalization, margins
 * and closure checks live in state-legislative-general-results.ts.
 */
export const STATE_GENERAL_ADAPTERS: readonly StateGeneralAdapter[] = [DISTRICT_OF_COLUMBIA_GENERAL, LOUISIANA_GENERAL, NEW_HAMPSHIRE_GENERAL, NEBRASKA_GENERAL, OKLAHOMA_GENERAL, MISSISSIPPI_GENERAL, ALABAMA_GENERAL, ALASKA_GENERAL, ARIZONA_GENERAL, ARKANSAS_GENERAL, CALIFORNIA_GENERAL, COLORADO_GENERAL, CONNECTICUT_GENERAL, DELAWARE_GENERAL, FLORIDA_GENERAL, GEORGIA_GENERAL, HAWAII_GENERAL, IDAHO_GENERAL, ILLINOIS_GENERAL, INDIANA_GENERAL, IOWA_GENERAL, KANSAS_GENERAL, KENTUCKY_GENERAL, MAINE_GENERAL, MARYLAND_GENERAL, MASSACHUSETTS_GENERAL, MICHIGAN_GENERAL, MINNESOTA_GENERAL, MISSOURI_GENERAL, MONTANA_GENERAL, NEVADA_GENERAL, NEW_JERSEY_GENERAL, NEW_MEXICO_GENERAL, NEW_YORK_GENERAL, NORTH_CAROLINA_GENERAL, NORTH_DAKOTA_GENERAL, OHIO_GENERAL, OREGON_GENERAL, PENNSYLVANIA_GENERAL, RHODE_ISLAND_GENERAL, SOUTH_CAROLINA_GENERAL, SOUTH_DAKOTA_GENERAL, TENNESSEE_GENERAL, TEXAS_GENERAL, UTAH_GENERAL, VERMONT_GENERAL, VIRGINIA_GENERAL, WASHINGTON_GENERAL, WEST_VIRGINIA_GENERAL, WISCONSIN_GENERAL, WYOMING_GENERAL];
