import { db } from "./drizzleClient";
import { plans } from "./schema/plans";
import { v4 as uuid } from "uuid";

const seedPlans = async () => {
  try {
    const planData = [
      {
        id: `${uuid()}`,
        name: "FREE",
        apiCallsPerDay: 1000,
        apiRequestsPerMinute: 50,
        dataRangeYears: 1,
        price: 0,
        currency: "INR",
      },
      {
        id: `${uuid()}`,
        name: "STARTER",
        apiCallsPerDay: 2500,
        apiRequestsPerMinute: 100,
        dataRangeYears: 3,
        price: 299,
        currency: "INR",
      },
      {
        id: `${uuid()}`,
        name: "BASIC",
        apiCallsPerDay: 10000,
        apiRequestsPerMinute: 150,
        dataRangeYears: 10,
        price: 899,
        currency: "INR",
      },
      {
        id: `${uuid()}`,
        name: "PRO",
        apiCallsPerDay: 50000,
        apiRequestsPerMinute: 200,
        dataRangeYears: 30,
        price: 2999,
        currency: "INR",
      },
    ];

    await db.insert(plans).values(planData);

    console.log("Plans seeded successfully!");
  } catch (err) {
    console.error("Error seeding plans:", err);
  }
};

seedPlans();
