const lineItemsInput = document.getElementById("lineitems-json");
const riskDataInput = document.getElementById("riskdata-json");
const statusText = document.getElementById("status-text");
const directionText = document.getElementById("direction-text");
const messageOutput = document.getElementById("message-output");

const lineToRiskMap = {
  id: "itemID",
  description: "productTitle",
  amountIncludingTax: "amountPerItem",
  quantity: "quantity",
  sku: "sku",
  upc: "upc",
  brand: "brand",
  manufacturer: "manufacturer",
  itemCategory: "category",
  color: "color",
  size: "size",
  receiverEmail: "receiverEmail"
};

const notMappedLineFields = [
  "amountExcludingTax",
  "taxAmount",
  "taxPercentage",
  "taxCategory",
  "productUrl",
  "imageUrl",
  "marketplaceSellerId"
];

let isProgrammaticUpdate = false;
let debounceTimer = null;

function parseJson(value) {
  if (!value.trim()) return null;
  return JSON.parse(value);
}

function prettyPrint(obj) {
  return JSON.stringify(obj, null, 2);
}

function extractLineItems(input) {
  if (Array.isArray(input)) return input;
  if (Array.isArray(input.lineItems)) return input.lineItems;
  throw new Error("lineItems must be an array or an object with a lineItems array.");
}

function extractBasket(input) {
  if (input?.riskData?.basket) return input.riskData.basket;
  if (input?.basket) return input.basket;
  throw new Error("riskData.basket or basket is required.");
}

function getAmountCurrency(input) {
  return input?.amount?.currency || input?.currency || null;
}

function lineItemsToRiskData(input) {
  const lineItems = extractLineItems(input);
  const currency = getAmountCurrency(input);
  const basket = {};
  const warnings = [];

  lineItems.forEach((item, index) => {
    const riskItem = {};
    const itemKey = `item${index + 1}`;

    for (const [lineKey, riskKey] of Object.entries(lineToRiskMap)) {
      if (item[lineKey] !== undefined && item[lineKey] !== null) {
        riskItem[riskKey] = String(item[lineKey]);
      }
    }

    if (currency) {
      riskItem.currency = String(currency);
    } else {
      warnings.push(`item${index + 1}: currency is not available. Expected input.amount.currency or input.currency.`);
    }

    notMappedLineFields.forEach((field) => {
      if (item[field] !== undefined && item[field] !== null) {
        warnings.push(`item${index + 1}: lineItems.${field} is not mapped to riskData.basket.`);
      }
    });

    basket[itemKey] = riskItem;
  });

  return {
    result: {
      riskData: {
        basket
      }
    },
    warnings
  };
}

function riskDataToLineItems(input) {
  const basket = extractBasket(input);
  const reverseMap = Object.fromEntries(
    Object.entries(lineToRiskMap).map(([lineKey, riskKey]) => [riskKey, lineKey])
  );

  const lineItems = [];
  const warnings = [];
  let detectedCurrency = null;

  Object.keys(basket)
    .sort((a, b) => Number(a.replace("item", "")) - Number(b.replace("item", "")))
    .forEach((itemKey) => {
      const riskItem = basket[itemKey];
      const lineItem = {};

      for (const [riskKey, lineKey] of Object.entries(reverseMap)) {
        if (riskItem[riskKey] !== undefined && riskItem[riskKey] !== null) {
          if (lineKey === "quantity" || lineKey === "amountIncludingTax") {
            lineItem[lineKey] = Number(riskItem[riskKey]);
          } else {
            lineItem[lineKey] = riskItem[riskKey];
          }
        }
      }

      if (riskItem.currency) {
        detectedCurrency = riskItem.currency;
      }

      lineItems.push(lineItem);
    });

  const result = { lineItems };

  if (detectedCurrency) {
    result.amount = {
      currency: detectedCurrency,
      value: 0
    };
    warnings.push("currency was mapped to amount.currency. amount.value is set to 0 as a placeholder.");
  }

  warnings.push(
    "The following lineItems fields cannot be restored from riskData.basket: amountExcludingTax, taxAmount, taxPercentage, taxCategory, productUrl, imageUrl, marketplaceSellerId."
  );

  return { result, warnings };
}

function updateMessage(status, warnings = []) {
  statusText.textContent = status;

  if (!warnings.length) {
    messageOutput.textContent = "No warnings.";
    return;
  }

  messageOutput.textContent = warnings.map((warning) => `- ${warning}`).join("\n");
}

function convertFromLineItems() {
  const input = parseJson(lineItemsInput.value);
  if (!input) {
    riskDataInput.value = "";
    updateMessage("Ready.");
    return;
  }

  const { result, warnings } = lineItemsToRiskData(input);

  isProgrammaticUpdate = true;
  riskDataInput.value = prettyPrint(result);
  isProgrammaticUpdate = false;

  directionText.textContent = "lineItems → riskData.basket";
  updateMessage("Converted successfully.", warnings);
}

function convertFromRiskData() {
  const input = parseJson(riskDataInput.value);
  if (!input) {
    lineItemsInput.value = "";
    updateMessage("Ready.");
    return;
  }

  const { result, warnings } = riskDataToLineItems(input);

  isProgrammaticUpdate = true;
  lineItemsInput.value = prettyPrint(result);
  isProgrammaticUpdate = false;

  directionText.textContent = "riskData.basket → lineItems";
  updateMessage("Converted successfully.", warnings);
}

function debounce(fn) {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(fn, 250);
}

lineItemsInput.addEventListener("input", () => {
  if (isProgrammaticUpdate) return;

  debounce(() => {
    try {
      convertFromLineItems();
    } catch (error) {
      statusText.textContent = "Invalid lineItems JSON.";
      directionText.textContent = "lineItems → riskData.basket";
      messageOutput.textContent = error.message;
    }
  });
});

riskDataInput.addEventListener("input", () => {
  if (isProgrammaticUpdate) return;

  debounce(() => {
    try {
      convertFromRiskData();
    } catch (error) {
      statusText.textContent = "Invalid riskData JSON.";
      directionText.textContent = "riskData.basket → lineItems";
      messageOutput.textContent = error.message;
    }
  });
});

document.getElementById("copy-lineitems").addEventListener("click", async () => {
  await navigator.clipboard.writeText(lineItemsInput.value);
  updateMessage("Copied lineItems JSON.");
});

document.getElementById("copy-riskdata").addEventListener("click", async () => {
  await navigator.clipboard.writeText(riskDataInput.value);
  updateMessage("Copied riskData JSON.");
});

document.getElementById("clear-lineitems").addEventListener("click", () => {
  lineItemsInput.value = "";
  updateMessage("Cleared lineItems.");
});

document.getElementById("clear-riskdata").addEventListener("click", () => {
  riskDataInput.value = "";
  updateMessage("Cleared riskData.");
});
