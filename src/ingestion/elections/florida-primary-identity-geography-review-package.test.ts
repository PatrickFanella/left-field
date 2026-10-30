/* eslint-disable @typescript-eslint/no-explicit-any -- adversarial immutable-package mutations */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalJson } from "../fec/aipac-proposed-packages";
import { buildFloridaPrimaryJointReviewPackage, validateFloridaPrimaryJointReviewPackage } from "./florida-primary-identity-geography-review-package";
const text=(path:string):string=>readFileSync(path,"utf8");
const load=(path:string)=>{const bytes=readFileSync(path);return{bytes,value:JSON.parse(bytes.toString("utf8")),sha256:createHash("sha256").update(bytes).digest("hex")}};
const digest=(domain:string,value:unknown):string=>createHash("sha256").update(domain,"ascii").update(canonicalJson(value),"utf8").digest("hex");
const build=(options?:{geographyJson?:string;sourceLockJson?:string})=>buildFloridaPrimaryJointReviewPackage({proposalJson:text("data/metadata/house-democratic-primary-source-selection-proposal-20260804-v1.json"),identityJson:text("data/metadata/florida-current-incumbent-primary-linkage-candidate-v1.json"),geographyJson:options?.geographyJson??text("data/metadata/florida-primary-geography-compatibility-candidate-v1.json"),sourceLockJson:options?.sourceLockJson??text("data/source-lock.json")});

describe("Florida primary identity/geography joint reviewer package",()=>{
  it("rebuilds fourteen exact joins with seven source-unobserved identities",()=>{
    const value=build();
    expect(value).toEqual(validateFloridaPrimaryJointReviewPackage(load("data/metadata/florida-primary-identity-geography-review-package-v1.json").value));
    expect(value.summary).toEqual({reviewRecords:14,identityAndGeographyCandidates:7,geographyCandidateIdentitySourceUnobserved:7,identityCandidates:7,geographyCandidates:14,officialExtractAuthorityRecords:7,reportedContestRecords:7,sourceUnobservedRecords:7,proposedDecisions:5,jointApprovedRecords:0,scoreEligibleRecords:0});
    const absent=value.records.find((row)=>row.reviewRecordId==="fl-primary-joint:2024:24");
    expect(absent).toMatchObject({reviewCategory:"geography_candidate_identity_source_unobserved",contestId:null,contestSha256:null,identity:{status:"source_unobserved",identityStatus:"source_unobserved_district_cycle_unresolved",candidate:false,approved:false},geography:{status:"candidate",candidate:true,approved:false},resultAuthorityStatus:null,certificationStatus:null,sourceWinnerStatus:"not_applicable_source_unobserved",jointApproved:false,scoreEligible:false});
  });

  it("keeps five decisions independent with evidence limited to applicable records",()=>{
    const value=build();
    expect(value.decisions.map(row=>[row.decisionId,row.evidenceRecordIds.length])).toEqual([["fl-primary:accept-official-extract-authority-v1",7],["fl-primary:accept-geography-compatibility-v1",14],["fl-primary:accept-identity-links-v1",7],["fl-primary:retain-primary-disposition-exclusion-v1",14],["fl-primary:retain-progressive-classification-exclusion-v1",14]]);
    expect(value.decisions.every(row=>row.review.status==="proposed"&&row.review.reviewer===null&&row.review.reviewedAt===null&&row.review.resolution===null&&row.blocksAffectedPublication&&!row.blocksOtherWork)).toBe(true);
    expect(value.inheritedDecisionResolutions).toEqual({certification:null,identity:null,geography:null,disposition:null,progressiveClassification:null});
  });

  it("rejects parent join drift and fully rehashed fabricated approval",()=>{
    const geography=load("data/metadata/florida-primary-geography-compatibility-candidate-v1.json").value as any;geography.rows[0].identityRowSha256="0".repeat(64);
    expect(()=>build({geographyJson:`${JSON.stringify(geography,null,2)}\n`})).toThrow();
    const drifted=structuredClone(build()) as any;drifted.review.status="approved";drifted.review.reviewer="fabricated";drifted.records[0].jointApproved=true;const record=structuredClone(drifted.records[0]);delete record.reviewRecordSha256;drifted.records[0].reviewRecordSha256=digest("dsa-seats:fl-primary-joint-review-row:v1\0",record);drifted.reviewRecordSetSha256=digest("dsa-seats:fl-primary-joint-review-row-set:v1\0",drifted.records);const unsigned=structuredClone(drifted);delete unsigned.packageSha256;drifted.packageSha256=digest("dsa-seats:fl-primary-joint-review-package:v1\0",unsigned);expect(()=>validateFloridaPrimaryJointReviewPackage(drifted)).toThrow("LIFECYCLE_INVALID");
  });

  it("retains exact three-parent proposal lineage",()=>{
    const lock=load("data/source-lock.json").value as any,artifact=load("data/metadata/florida-primary-identity-geography-review-package-v1.json");
    expect(lock.entries.filter((entry:any)=>entry.id==="florida-primary-identity-geography-review-package-v1")).toEqual([{id:"florida-primary-identity-geography-review-package-v1",url:"urn:dsa-seats:florida-primary-identity-geography-review-package:v1:2026-08-06",retainedPath:"data/metadata/florida-primary-identity-geography-review-package-v1.json",retainedStatus:"retained",byteSize:artifact.bytes.length,sha256:artifact.sha256,kind:"review_proposal",parentIds:["house-democratic-primary-source-selection-proposal-20260804-v1","florida-current-incumbent-primary-linkage-candidate-v1","florida-primary-geography-compatibility-candidate-v1"],license:"unknown"}]);
  });
});
