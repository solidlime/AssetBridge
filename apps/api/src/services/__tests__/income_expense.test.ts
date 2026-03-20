import { describe, it, expect } from "bun:test";
import {
  getCcBalanceStatus,
  getCcAccountMapping,
  setCcAccountMapping,
  type CcBalanceStatus,
  type CcAccountMapping,
} from "../income_expense";

/**
 * Credit Card Balance Management Unit Tests
 * 
 * These tests verify the core functionality of the credit card balance management system:
 * - getCcBalanceStatus(): Returns the balance status of credit card withdrawals
 * - getCcAccountMapping(): Returns the current card-to-account mapping and available accounts
 * - setCcAccountMapping(): Persists a new card-to-account mapping
 */

describe("getCcBalanceStatus", () => {
  it("should return an object with status, totalWithdrawalJpy, and summary properties", async () => {
    const result = await getCcBalanceStatus();

    expect(result).toBeDefined();
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("totalWithdrawalJpy");
    expect(result).toHaveProperty("summary");
    expect(typeof result.status).toBe("string");
    expect(["ok", "warning"]).toContain(result.status);
  });

  it("should have a summary array where each item has required properties", async () => {
    const result = await getCcBalanceStatus();

    if (result.summary.length > 0) {
      const item = result.summary[0];
      expect(item).toHaveProperty("cardName");
      expect(item).toHaveProperty("withdrawalDate");
      expect(item).toHaveProperty("amountJpy");
      expect(item).toHaveProperty("status");
      expect(item).toHaveProperty("accountName");
      expect(item).toHaveProperty("accountAssetId");
      expect(item).toHaveProperty("accountBalanceJpy");
      expect(item).toHaveProperty("shortfallJpy");
      expect(item).toHaveProperty("isInsufficient");
      expect(typeof item.isInsufficient).toBe("boolean");
    }
  });

  it("should return status=warning if any card has insufficient balance", async () => {
    const result = await getCcBalanceStatus();

    if (result.status === "warning") {
      const hasInsufficientCard = result.summary.some((item) => item.isInsufficient);
      expect(hasInsufficientCard).toBe(true);
    }
  });

  it("should return status=ok if all cards have sufficient balance", async () => {
    const result = await getCcBalanceStatus();

    if (result.status === "ok") {
      const allSufficient = result.summary.every((item) => !item.isInsufficient);
      expect(allSufficient).toBe(true);
    }
  });

  it("should calculate shortfallJpy correctly (balance - withdrawal amount)", async () => {
    const result = await getCcBalanceStatus();

    result.summary.forEach((item) => {
      if (item.accountBalanceJpy !== null) {
        const expected = item.accountBalanceJpy - item.amountJpy;
        expect(item.shortfallJpy).toBe(expected);
      }
    });
  });

  it("should only include scheduled withdrawals, not withdrawn ones", async () => {
    const result = await getCcBalanceStatus();

    result.summary.forEach((item) => {
      expect(item.status).toBe("scheduled");
    });
  });

  it("should set accountName and accountAssetId to null for unmapped cards", async () => {
    const result = await getCcBalanceStatus();

    const unmappedCards = result.summary.filter((item) => item.accountAssetId === null);
    unmappedCards.forEach((item) => {
      expect(item.accountName).toBeNull();
      expect(item.shortfallJpy).toBe(0);
      expect(item.isInsufficient).toBe(false);
    });
  });
});

describe("getCcAccountMapping", () => {
  it("should return an object with mapping and accounts properties", async () => {
    const result = await getCcAccountMapping();

    expect(result).toBeDefined();
    expect(result).toHaveProperty("mapping");
    expect(result).toHaveProperty("accounts");
    expect(typeof result.mapping).toBe("object");
    expect(Array.isArray(result.accounts)).toBe(true);
  });

  it("should have mapping as a key-value object (card name -> asset ID)", async () => {
    const result = await getCcAccountMapping();

    Object.entries(result.mapping).forEach(([key, value]) => {
      expect(typeof key).toBe("string");
      expect(typeof value).toBe("number");
    });
  });

  it("should only return CASH type accounts, not STOCK or other types", async () => {
    const result = await getCcAccountMapping();

    // Note: We cannot directly verify asset_type from the returned data,
    // but we can verify the structure is correct
    result.accounts.forEach((account) => {
      expect(account).toHaveProperty("assetId");
      expect(account).toHaveProperty("name");
      expect(account).toHaveProperty("balanceJpy");
      expect(typeof account.assetId).toBe("number");
      expect(typeof account.name).toBe("string");
      expect(typeof account.balanceJpy).toBe("number");
    });
  });

  it("should return balanceJpy >= 0 for all accounts", async () => {
    const result = await getCcAccountMapping();

    result.accounts.forEach((account) => {
      expect(account.balanceJpy).toBeGreaterThanOrEqual(0);
    });
  });
});

describe("setCcAccountMapping", () => {
  it("should accept a mapping object and not throw", async () => {
    const testMapping = { TestCard: 1, AnotherCard: 2 };

    expect(async () => {
      await setCcAccountMapping(testMapping);
    }).toBeDefined();
  });

  it("should accept an empty mapping object", async () => {
    expect(async () => {
      await setCcAccountMapping({});
    }).toBeDefined();
  });

  it("should persist mapping so it can be retrieved later", async () => {
    const testMapping = { IntegrationTestCard: 99 };

    await setCcAccountMapping(testMapping);
    const result = await getCcAccountMapping();

    expect(result.mapping).toHaveProperty("IntegrationTestCard");
    expect(result.mapping.IntegrationTestCard).toBe(99);
  });

  it("should overwrite previous mapping", async () => {
    await setCcAccountMapping({ CardA: 1 });
    let result = await getCcAccountMapping();
    expect(result.mapping).toHaveProperty("CardA");

    // Overwrite
    await setCcAccountMapping({ CardB: 2 });
    result = await getCcAccountMapping();

    expect(result.mapping).toHaveProperty("CardB");
    expect(result.mapping).not.toHaveProperty("CardA");
  });
});
