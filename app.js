const lineToRiskMap = {
  id: "itemID",
  description: "productTitle",
  quantity: "quantity",
  amountIncludingTax: "price",
  productUrl: "itemURL",
  imageUrl: "imageURL",
  itemCategory: "category"
};

function lineItemsToRiskData(lineItems) {
  const basket = {};

  lineItems.forEach((item, index) => {
    const riskItem = {};
    const itemKey = `item${index + 1}`;

    for (const [lineKey, riskKey] of Object.entries(lineToRiskMap)) {
      if (item[lineKey] !== undefined) {
        riskItem[riskKey] = String(item[lineKey]);
      }
    }

    basket[itemKey] = riskItem;
  });

  return {
    riskData: {
      basket
    }
  };
}

function riskDataToLineItems(riskData) {
  const basket = riskData.riskData?.basket || riskData.basket || {};
  const lineItems = [];

  const reverseMap = Object.fromEntries(
    Object.entries(lineToRiskMap).map(([lineKey, riskKey]) => [riskKey, lineKey])
  );

  Object.keys(basket)
    .sort((a, b) => Number(a.replace("item", "")) - Number(b.replace("item", "")))
    .forEach((itemKey) => {
      const riskItem = basket[itemKey];
      const lineItem = {};

      for (const [riskKey, lineKey] of Object.entries(reverseMap)) {
        if (riskItem[riskKey] !== undefined) {
          const value = riskItem[riskKey];

          if (lineKey === "quantity" || lineKey === "amountIncludingTax") {
            lineItem[lineKey] = Number(value);
          } else {
            lineItem[lineKey] = value;
          }
        }
      }

      lineItems.push(lineItem);
    });

  return { lineItems };
}
