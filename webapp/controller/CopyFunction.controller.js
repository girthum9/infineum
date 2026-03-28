sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "accrual/service/WorkflowAPI"
], function(Controller, JSONModel, MessageBox, MessageToast, WorkflowAPI) {
    "use strict";

    return Controller.extend("accrual.controller.CopyFunction", {
        
onInit: function() {
    var sEmail = this._getEmailFromURL();
    var sMonthEndDate = this._getCurrentMonthEndDate();
    
    var oModel = new JSONModel({
        affiliate: "",
        nameAccrual: "",
        cutoffDate: sMonthEndDate,
        companyCode: "",
        requestedBy: sEmail || "",
        approvedBy: "",
        requestType: "",
        typeOfParty: "",
        csNumber: "",
        selectedItemsCount: 0,
        currency: "",
        items: [
            this._createEmptyItem()
        ],
        companyCodes: [],
        affiliateToCompanyCodeMap: {},
        companyCodesLoaded: false,
        glAccounts: [],
        glAccountsLoaded: false,
        costCentres: [],
        costCentresLoaded: false,
        internalOrders: [],
        internalOrdersLoaded: false,
        salesOrders: [],
        salesOrdersLoaded: false,
        currencies: [],
        currenciesLoaded: false,
        isEditMode: false,
        instanceId: "",
        dmsDocuments: [],
        dmsFolderId: ""
    });
    
    this.getView().setModel(oModel);
    
    // Check for instance ID in URL on initial load
    var sInstanceId = this._getInstanceIdFromURL();
    if (sInstanceId) {
        this._loadInstanceData(sInstanceId);
    }
    
    // Add hash change listener to detect URL changes
    var that = this;
    this._hashChangeHandler = function() {
        that._onHashChanged();
    };
    window.addEventListener("hashchange", this._hashChangeHandler);
    
    var that = this;
    this.getView().addEventDelegate({
        onAfterRendering: function() {
            var oComboBox = that.byId("affiliateSelect");
            if (oComboBox && !oComboBox._bEventAttached) {
                oComboBox.attachBrowserEvent("click", function() {
                    that.onAffiliateOpen();
                });
                oComboBox._bEventAttached = true;
            }
        }
    }, this);
},
_onHashChanged: function() {
    console.log("=== Hash Changed Event ===");
    console.log("Full URL:", window.location.href);
    console.log("Hash:", window.location.hash);
    
    var oModel = this.getView().getModel();
    var sNewInstanceId = this._getInstanceIdFromURL();
    var sCurrentInstanceId = oModel.getProperty("/instanceId");
    
    console.log("Current instance ID in model:", sCurrentInstanceId);
    console.log("New instance ID from URL:", sNewInstanceId);
    
    // If instance ID changed, reload data
    if (sNewInstanceId && sNewInstanceId !== sCurrentInstanceId) {
        console.log("✓ Instance ID changed, reloading data...");
        this._loadInstanceData(sNewInstanceId);
    } else if (!sNewInstanceId && sCurrentInstanceId) {
        // URL changed to no instance ID (navigated to new request)
        console.log("✓ Navigated to new request, clearing form...");
        this._refreshForm();
    } else {
        console.log("✗ No action needed - instance ID unchanged");
    }
},
        onAffiliateOpen: function() {
            var oModel = this.getView().getModel();
            var bLoaded = oModel.getProperty("/companyCodesLoaded");
            
            if (!bLoaded) {
                this._fetchCompanyCodes();
            }
        },

_fetchCompanyCodes: function() {

    var that = this;
    var oModel = this.getView().getModel();
    var oAffiliateSelect = this.byId("affiliateSelect");

    if (oAffiliateSelect) {
        oAffiliateSelect.setBusy(true);
    }

    return WorkflowAPI.fetchCompanyCodes()

    .then(function(aCompanyCodes) {

        var aFilteredCompanyCodes = aCompanyCodes.filter(function(item) {
            return item.CompanyCodeName &&
                   item.CompanyCodeName.toUpperCase().startsWith("INFINEUM");
        });

        aFilteredCompanyCodes.sort(function(a,b){
            return (a.CompanyCodeName || "")
                .localeCompare(b.CompanyCodeName || "");
        });

        var oMapping = {};
        aFilteredCompanyCodes.forEach(function(item){
            if(item.CompanyCodeName && item.CompanyCode){
                oMapping[item.CompanyCodeName] = item.CompanyCode;
            }
        });

        oModel.setProperty("/companyCodes", aFilteredCompanyCodes);
        oModel.setProperty("/affiliateToCompanyCodeMap", oMapping);
        oModel.setProperty("/companyCodesLoaded", true);

    })

    .finally(function(){
        if(oAffiliateSelect){
            oAffiliateSelect.setBusy(false);
        }
    });
},

onExit: function() {
    // Remove hash change listener when view is destroyed
    if (this._hashChangeHandler) {
        window.removeEventListener("hashchange", this._hashChangeHandler);
    }
},

        _fetchCurrencyFromCostCenter: function(companyCode) {
            if (!companyCode) {
                console.warn("Company code not provided for currency fetch");
                return Promise.resolve(null);
            }
            
            var url = this._costCentreConfig.apiEndpoint + "?$filter=CompanyCode eq '" + companyCode + "'";
            console.log("Fetching currency from Cost Center API:", url);
            
            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": "Basic " + btoa(
                        this._costCentreConfig.Username + ":" + 
                        this._costCentreConfig.Password
                    ),
                    "Accept": "application/json"
                }
            })
            .then(function(response) {
                if (!response.ok) {
                    console.error("Failed to fetch currency from cost center:", response.status);
                    return null;
                }
                return response.json();
            })
            .then(function(data) {
                if (data && data.d && data.d.results && data.d.results.length > 0) {
                    var currency = data.d.results[0].CostCenterCurrency;
                    console.log("Currency fetched from Cost Center:", currency);
                    return currency;
                }
                return null;
            })
            .catch(function(error) {
                console.error("Error fetching currency from cost center:", error);
                return null;
            });
        },

_fetchGLAccounts: function(companyCode){
    return WorkflowAPI.fetchGLAccounts(companyCode);
},

_fetchPurchaseOrders: function(supplierNumber){
    return WorkflowAPI.fetchPurchaseOrders(supplierNumber);
},

_fetchPurchaseOrderItems: function(po){
    return WorkflowAPI.fetchPurchaseOrderItems(po);
},

_fetchCostCentres: function(companyCode){
    return WorkflowAPI.fetchCostCentres(companyCode);
},

_fetchInternalOrders: function(companyCode){
    return WorkflowAPI.fetchInternalOrders(companyCode);
},

_fetchSalesOrders: function(){
    return WorkflowAPI.fetchSalesOrders();
},

        _fetchSalesOrderItems: function(salesOrder) {
            if (!salesOrder) {
                return Promise.resolve([]);
            }
            
            var url = this._salesOrderConfig.apiEndpoint + "?$filter=SalesOrder eq '" + salesOrder + "'";
            console.log("Fetching Sales Order Items from:", url);
            
            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": "Basic " + btoa(
                        this._salesOrderConfig.Username + ":" + 
                        this._salesOrderConfig.Password
                    ),
                    "Accept": "application/json"
                }
            })
            .then(function(response) {
                if (!response.ok) {
                    console.error("Failed to fetch sales order items:", response.status);
                    return [];
                }
                return response.json();
            })
            .then(function(data) {
                if (data && data.d && data.d.results) {
                    console.log("Found " + data.d.results.length + " sales order items");
                    return data.d.results;
                }
                return [];
            })
            .catch(function(error) {
                console.error("Error fetching sales order items:", error);
                return [];
            });
        },

_fetchCurrencies: function(){
    return WorkflowAPI.fetchCurrencies();
},

        _fetchSegmentData: function(salesOrder) {
            if (!salesOrder) {
                return Promise.resolve(null);
            }
            
            var url = this._segmentConfig.apiEndpoint + "?$filter=SalesOrder eq '" + salesOrder + "'";
            console.log("Fetching Segment data from:", url);
            
            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": "Basic " + btoa(
                        this._segmentConfig.Username + ":" + 
                        this._segmentConfig.Password
                    ),
                    "Accept": "application/json"
                }
            })
            .then(function(response) {
                if (!response.ok) {
                    console.error("Failed to fetch segment data:", response.status);
                    return null;
                }
                return response.json();
            })
            .then(function(data) {
                if (data && data.d && data.d.results && data.d.results.length > 0) {
                    var segmentData = data.d.results[0];
                    console.log("Segment data fetched:", segmentData);
                    return {
                        Product: segmentData.Product || "",
                        ShipToParty: segmentData.ShipToParty || "",
                        SoldToParty: segmentData.SoldToParty || ""
                    };
                }
                return null;
            })
            .catch(function(error) {
                console.error("Error fetching segment data:", error);
                return null;
            });
        },

        _fetchGLAccountForSupplierCustomer: function(supplierCustomerNumber, typeOfParty) {
            var oModel = this.getView().getModel();
            var sCompanyCode = oModel.getProperty("/companyCode");
            
            if (!sCompanyCode) {
                return Promise.resolve(null);
            }
            
            var endpoint = "";
            if (typeOfParty === "Supplier") {
                endpoint = this._businessPartnerConfig.baseEndpoint + "/A_Supplier('" + supplierCustomerNumber + "')/to_SupplierCompany";
            } else if (typeOfParty === "Customer") {
                endpoint = this._businessPartnerConfig.baseEndpoint + "/A_Customer('" + supplierCustomerNumber + "')/to_CustomerCompany";
            } else {
                return Promise.resolve(null);
            }
            
            return fetch(endpoint, {
                method: "GET",
                headers: {
                    "Authorization": "Basic " + btoa(
                        this._businessPartnerConfig.Username + ":" + 
                        this._businessPartnerConfig.Password
                    ),
                    "Accept": "application/json"
                }
            })
            .then(function(response) {
                if (!response.ok) {
                    return null;
                }
                return response.json();
            })
            .then(function(data) {
                if (data && data.d && data.d.results && data.d.results.length > 0) {
                    var matchingEntry = data.d.results.find(function(item) {
                        return item.CompanyCode === sCompanyCode;
                    });
                    
                    if (matchingEntry && matchingEntry.ReconciliationAccount) {
                        return matchingEntry.ReconciliationAccount;
                    } else {
                        return data.d.results[0].ReconciliationAccount;
                    }
                }
                return null;
            })
            .catch(function(error) {
                console.error("Error fetching GL account:", error);
                return null;
            });
        },

        _getCurrentMonthEndDate: function() {
            var today = new Date();
            var year = today.getFullYear();
            var month = today.getMonth() + 1;
            
            var lastDay = new Date(year, month, 0).getDate();
            
            var formattedMonth = month.toString().padStart(2, '0');
            var formattedDay = lastDay.toString().padStart(2, '0');
            
            return "" + year + formattedMonth + formattedDay;
        },

_getCurrentDateFormatted: function() {
    var today = new Date();
    var day = today.getDate().toString().padStart(2, '0');
    var month = (today.getMonth() + 1).toString().padStart(2, '0');
    var year = today.getFullYear();
    
    // Changed format from dd.mm.yyyy to mm-dd-yyyy
    return month + "-" + day + "-" + year;
},

        _getEmailFromURL: function() {
            try {
                var oComponentData = this.getOwnerComponent().getComponentData();
                if (oComponentData && oComponentData.startupParameters) {
                    var email = oComponentData.startupParameters.email;
                    if (email && email[0]) {
                        return email[0];
                    }
                }

                var urlParams = new URLSearchParams(window.location.search);
                var emailFromQuery = urlParams.get('email');
                if (emailFromQuery) {
                    return emailFromQuery;
                }

                var hash = window.location.hash;
                if (hash) {
                    var hashParams = new URLSearchParams(hash.split('?')[1]);
                    var emailFromHash = hashParams.get('email');
                    if (emailFromHash) {
                        return emailFromHash;
                    }
                }

                if (window.location.hash.includes('email=')) {
                    var match = window.location.hash.match(/email=([^&]*)/);
                    if (match && match[1]) {
                        return decodeURIComponent(match[1]);
                    }
                }

                return "";
            } catch (error) {
                console.error("Error extracting email from URL:", error);
                return "";
            }
        },

     _getInstanceIdFromURL: function() {
    try {
        // Get the hash from URL
        var hash = window.location.hash;
        
        console.log("Full URL hash:", hash);
        
        // Pattern 1: #app-preview&/request/{instanceId}
        var match1 = hash.match(/#app-preview&\/Copy\/([a-f0-9\-]+)/i);
        
        // Pattern 2: #/request/{instanceId} (fallback for different URL structure)
        var match2 = hash.match(/#\/Copy\/([a-f0-9\-]+)/i);
        
        if (match1 && match1[1]) {
            console.log("Instance ID found (Pattern 1):", match1[1]);
            return match1[1];
        }
        
        if (match2 && match2[1]) {
            console.log("Instance ID found (Pattern 2):", match2[1]);
            return match2[1];
        }
        
        console.log("No instance ID found in URL");
        return null;
    } catch (error) {
        console.error("Error extracting instance ID from URL:", error);
        return null;
    }
},

_loadInstanceData: function(sInstanceId) {

    var that = this;
    var oModel = this.getView().getModel();

    sap.ui.core.BusyIndicator.show(0);

    WorkflowAPI.fetchWorkflowInstanceContext(sInstanceId)

    .then(function(data) {

        console.log("Instance data received:", data);

        var formData = null;

        if (data.form_accrualSubmissionForm_2) {
            formData = data.form_accrualSubmissionForm_2;
            console.log("✓ Using form_accrualSubmissionForm_2 data");
        }
        else if (data.startEvent && data.startEvent.accrual) {
            formData = data.startEvent.accrual;
            console.log("✓ Using startEvent.accrual data (fallback)");
        }
        else if (data.accrual) {
            formData = data.accrual;
            console.log("✓ Using accrual data (fallback)");
        }
        else {
            console.error("Unexpected data structure:", data);
            throw new Error("Invalid instance data format - cannot find form data");
        }

        console.log("Form data extracted:", formData);

        that._mapInstanceDataToModel(formData, sInstanceId);

    })

    .catch(function(error) {

        console.error("Error loading instance data:", error);

        MessageBox.error(
            "Failed to load instance data.\n\n" + error.message
        );

    })

    .finally(function() {
        sap.ui.core.BusyIndicator.hide();
    });

},

_mapInstanceDataToModel: function(formData, sInstanceId) {
    var that = this;
    var oModel = this.getView().getModel();
    
    console.log("Mapping form data to model:", formData);
    
    // Mark as edit mode
    oModel.setProperty("/isEditMode", true);
    oModel.setProperty("/instanceId", sInstanceId);
    
    // Helper function to get value with fallback for different casings
    var getValue = function(obj, key1, key2, key3) {
        return obj[key1] || obj[key2] || obj[key3] || "";
    };
    
    // Map header fields - handle both lowercase and uppercase field names
    oModel.setProperty("/affiliate", getValue(formData, "affiliate", "Affiliate"));
    oModel.setProperty("/companyCode", getValue(formData, "companyCode", "CompanyCode"));
    oModel.setProperty("/nameAccrual", getValue(formData, "nameYourAccrual", "NameYourAccrual"));
    oModel.setProperty("/requestedBy", getValue(formData, "requestedBy", "RequestedBy"));
    oModel.setProperty("/approvedBy", getValue(formData, "approvedBy", "ApprovedBy"));
    oModel.setProperty("/cutoffDate", getValue(formData, "accrualCutOffDate", "AccrualCutOffDate"));
    oModel.setProperty("/requestType", getValue(formData, "typeOfRequest", "TypeofRequest"));
    oModel.setProperty("/typeOfParty", getValue(formData, "typeOfParty", "Partytype"));
    
    // Map line items - check for different table names
    var accrualTable = formData.accrual_Table || formData.Accrual_Table || [];
    
    console.log("Accrual table data:", accrualTable);
    
    if (accrualTable && accrualTable.length > 0) {
        var aItems = accrualTable.map(function(item) {
            return {
                supplier: getValue(item, "supplierCustomer", "SupplierCustomer"),
                supplierNumber: "",
                description: getValue(item, "description", "Description"),
                currency: getValue(item, "currency", "Currency"),
                excludeTax: getValue(item, "excludeTax", "ExcludeTax"),
                glAccount: getValue(item, "gLAccountCode", "GLAccountCode"),
                creditDebit: getValue(item, "creditDebitIndicator", "CreditDebitIndicator"),
                // FIX: Purchase Order fields with all possible variations
                poNumber: getValue(item, "purchaseOrderNumber", "PurchaseOrderNumber"),
                poLineItem: getValue(item, "purchaseOrderLineItem", "PurchaseOrderLineItem"),
                costCentre: getValue(item, "costCentre", "CostCentre"),
                internalOrder: getValue(item, "internalOrder", "InternalOrder"),
                wbs: getValue(item, "wBS", "WBS"),
                tradingPartner: getValue(item, "tradingPartner", "TradingPartner"),
                salesOrder: getValue(item, "salesOrderNumber", "SalesOrderNumber"),
                salesOrderItem: getValue(item, "salesOrderItemNumber", "SalesOrderItemNumber"),
                SegmentProduct: getValue(item, "segmentProduct", "SegmentProduct"),
                segmentShip: getValue(item, "segmentShiptoParty", "SegmentShiptoParty"),
                segmentSold: getValue(item, "segmentSoldtoParty", "SegmentSoldtoParty"),
                purchaseOrders: [],
                purchaseOrderItems: [],
                salesOrderItems: [],
                supplierState: "None",
                supplierStateText: "",
                descriptionState: "None",
                descriptionStateText: "",
                currencyState: "None",
                currencyStateText: "",
                excludeTaxState: "None",
                excludeTaxStateText: "",
                glAccountState: "None",
                glAccountStateText: "",
                creditDebitState: "None",
                creditDebitStateText: ""
            };
        });
        
        console.log("Mapped items:", aItems);
        oModel.setProperty("/items", aItems);
        
        // After setting items, fetch supplier numbers and PO data
        this._loadSupplierNumbersAndPOData(accrualTable, getValue(formData, "typeOfParty", "Partytype"));
    } else {
        console.warn("No accrual table data found");
    }
    
    // Store currency at model level
    if (accrualTable && accrualTable.length > 0) {
        oModel.setProperty("/currency", getValue(accrualTable[0], "currency", "Currency"));
    }
    
    // Trigger affiliate change to load dependent data
    var sAffiliate = getValue(formData, "affiliate", "Affiliate");
    var sCompanyCode = getValue(formData, "companyCode", "CompanyCode");
    
    if (sAffiliate && sCompanyCode) {
        var bCompanyCodesLoaded = oModel.getProperty("/companyCodesLoaded");
        
        if (!bCompanyCodesLoaded) {
            this._fetchCompanyCodes()
                .then(function() {
                    return that._fetchRelatedDataForAffiliate(sCompanyCode);
                })
                .catch(function(error) {
                    console.error("Error loading related data:", error);
                });
        } else {
            this._fetchRelatedDataForAffiliate(sCompanyCode)
                .catch(function(error) {
                    console.error("Error loading related data:", error);
                });
        }
    }
    
    console.log("Instance data mapped to model successfully");
},

_loadSupplierNumbersAndPOData: function(accrualTable, typeOfParty) {
    var that = this;
    var oModel = this.getView().getModel();
    
    console.log("Loading supplier numbers and PO data...");
    
    var oTable = this.byId("Copy_itemsTable");
    if (oTable) {
        oTable.setBusy(true);
        oTable.setBusyIndicatorDelay(0);
    }
    sap.ui.core.BusyIndicator.show(0);
    
    // Cache to avoid duplicate API calls for same supplier
    var oSupplierNumberCache = {};  // supplierName -> supplierNumber
    var oPOCache = {};              // supplierNumber -> purchaseOrders[]
    
    var processItem = function(index) {
        if (index >= accrualTable.length) {
            sap.ui.core.BusyIndicator.hide();
            if (oTable) {
                oTable.setBusy(false);
            }
            MessageToast.show("Data loaded successfully");
            return Promise.resolve();
        }
        
        var item = accrualTable[index];
        var supplierCustomerName = item.supplierCustomer || item.SupplierCustomer || "";
        var existingPONumber = item.purchaseOrderNumber || item.PurchaseOrderNumber || "";
        var existingPOLineItem = item.purchaseOrderLineItem || item.PurchaseOrderLineItem || "";
        
        console.log("Processing item", index, ":", supplierCustomerName, "PO:", existingPONumber);
        
        if (!supplierCustomerName) {
            return processItem(index + 1);
        }
        
        // Use cached supplier number if available
        var getSupplierNumber = function() {
            if (oSupplierNumberCache[supplierCustomerName]) {
                console.log("Using cached supplier number for:", supplierCustomerName);
                return Promise.resolve(oSupplierNumberCache[supplierCustomerName]);
            }
            return that._searchSupplierByName(supplierCustomerName, typeOfParty)
                .then(function(supplierNumber) {
                    if (supplierNumber) {
                        oSupplierNumberCache[supplierCustomerName] = supplierNumber;
                    }
                    return supplierNumber;
                });
        };
        
        return getSupplierNumber()
            .then(function(supplierNumber) {
                if (!supplierNumber) {
                    console.warn("No supplier number found for:", supplierCustomerName);
                    return Promise.resolve();
                }
                
                console.log("Supplier number for item", index, ":", supplierNumber);
                oModel.setProperty("/items/" + index + "/supplierNumber", supplierNumber);
                
                if (typeOfParty !== "Supplier") {
                    return Promise.resolve();
                }
                
                // Use cached POs if available
                var getPurchaseOrders = function() {
                    if (oPOCache[supplierNumber]) {
                        console.log("Using cached POs for supplier:", supplierNumber);
                        return Promise.resolve(oPOCache[supplierNumber]);
                    }
                    return that._fetchPurchaseOrders(supplierNumber)
                        .then(function(aPurchaseOrders) {
                            oPOCache[supplierNumber] = aPurchaseOrders;
                            return aPurchaseOrders;
                        });
                };
                
                return getPurchaseOrders()
                    .then(function(aPurchaseOrders) {
                        console.log("POs for item " + index + ":", aPurchaseOrders);
                        
                        // STEP 1: Set purchaseOrders array first
                        oModel.setProperty("/items/" + index + "/purchaseOrders", aPurchaseOrders);
                        
                        if (!existingPONumber || aPurchaseOrders.length === 0) {
                            return Promise.resolve();
                        }
                        
                        // STEP 2: Wait longer for ComboBox to fully bind items
                        return new Promise(function(resolve) {
                            setTimeout(function() {
                                // STEP 3: Now set the selected key
                                oModel.setProperty("/items/" + index + "/poNumber", existingPONumber);
                                console.log("poNumber set for item " + index + ":", existingPONumber);
                                
                                if (!existingPOLineItem) {
                                    resolve();
                                    return;
                                }
                                
                                // STEP 4: Fetch and set PO line items
                                that._fetchPurchaseOrderItems(existingPONumber)
                                    .then(function(aPOItems) {
                                        oModel.setProperty("/items/" + index + "/purchaseOrderItems", aPOItems);
                                        
                                        setTimeout(function() {
                                            oModel.setProperty("/items/" + index + "/poLineItem", existingPOLineItem);
                                            console.log("poLineItem set for item " + index + ":", existingPOLineItem);
                                            resolve();
                                        }, 500);
                                    })
                                    .catch(function(error) {
                                        console.error("Error fetching PO items for item " + index, error);
                                        resolve();
                                    });
                            }, 800); // Increased delay to 800ms
                        });
                    });
            })
            .catch(function(error) {
                console.error("Error loading data for item " + index, error);
            })
            .then(function() {
                return processItem(index + 1);
            });
    };
    
    // Increased initial delay to 800ms
    setTimeout(function() {
        processItem(0)
            .catch(function(error) {
                console.error("Error in sequential processing:", error);
                sap.ui.core.BusyIndicator.hide();
                if (oTable) {
                    oTable.setBusy(false);
                }
            });
    }, 800);
},

_searchSupplierByName: function(supplierName, typeOfParty) {
    return WorkflowAPI.searchSupplierByName(supplierName, typeOfParty);
},

_fetchRelatedDataForAffiliate: function(sCompanyCode) {
    var that = this;
    var oModel = this.getView().getModel();
    
    if (!sCompanyCode) {
        return Promise.resolve();
    }
    
    sap.ui.core.BusyIndicator.show(0);
    
    // Load currencies silently in the background
    var bCurrenciesLoaded = oModel.getProperty("/currenciesLoaded");
    if (!bCurrenciesLoaded) {
        this._fetchCurrencies()
            .then(function(currencies) {
                if (currencies && currencies.length > 0) {
                    oModel.setProperty("/currencies", currencies);
                    oModel.setProperty("/currenciesLoaded", true);
                    console.log("Currencies loaded in background:", currencies.length);
                }
            })
            .catch(function(error) {
                console.error("Error loading currencies in background:", error);
            });
    }
    
    return this._fetchGLAccounts(sCompanyCode)
        .then(function(glAccounts) {
            if (glAccounts && glAccounts.length > 0) {
                oModel.setProperty("/glAccounts", glAccounts);
                oModel.setProperty("/glAccountsLoaded", true);
            }
            
            return that._fetchCostCentres(sCompanyCode);
        })
        .then(function(costCentres) {
            if (costCentres && costCentres.length > 0) {
                oModel.setProperty("/costCentres", costCentres);
                oModel.setProperty("/costCentresLoaded", true);
            }
            
            return that._fetchInternalOrders(sCompanyCode);
        })
        .then(function(internalOrders) {
            if (internalOrders && internalOrders.length > 0) {
                oModel.setProperty("/internalOrders", internalOrders);
                oModel.setProperty("/internalOrdersLoaded", true);
            }
            
            return that._fetchSalesOrders();
        })
        .then(function(salesOrders) {
            if (salesOrders && salesOrders.length > 0) {
                oModel.setProperty("/salesOrders", salesOrders);
                oModel.setProperty("/salesOrdersLoaded", true);
            }
        })
        .finally(function() {
            sap.ui.core.BusyIndicator.hide();
        });
},

_calculateFinanceApproval: function(oData) {
    var sCompanyCode = (oData.companyCode || "").toUpperCase().trim();

    // Rule 1: China company codes always require finance approval
    if (sCompanyCode === "CNC1" || sCompanyCode === "CNC2") {
        console.log("Finance approval required: China company code detected -", sCompanyCode);
        return true;
    }

    // Rule 2: Check if ANY single line item amount exceeds 25,000
    var aItems = oData.items || [];
    var bHighValue = aItems.some(function(item) {
        if (!item.excludeTax) {
            return false;
        }
        var fAmount = parseFloat(item.excludeTax);
        if (isNaN(fAmount)) {
            return false;
        }
        return fAmount > 25000;
    });

    if (bHighValue) {
        console.log("Finance approval required: Line item amount exceeds 25,000");
        return true;
    }

    console.log("Finance approval not required");
    return false;
},

_preparePayloadForPatch: function(oData, iStatus) {
    // Calculate finance approval flag (same logic as RequestPage)
    var bFinanceApproval = this._calculateFinanceApproval(oData);
    console.log("Finance Approval flag (PATCH):", bFinanceApproval);

    var payload = {
        status: "COMPLETED",
        decision: "submit",
        context: {
            affiliate: oData.affiliate || "",
            companyCode: oData.companyCode || "",
            nameYourAccrual: oData.nameAccrual || "",
            requestedBy: oData.requestedBy || "",
            approvedBy: oData.approvedBy || "",
            accrualCutOffDate: oData.cutoffDate || "",
            typeOfRequest: oData.requestType || "",
            typeOfParty: oData.typeOfParty || "",
            status: iStatus.toString(),
            financeApproval: bFinanceApproval,
            supportingDocuments: oData.dmsFolderId
    ? "spa-res:cmis:folderid:" + oData.dmsFolderId
    : "",
Lastupdateddate: this._getCurrentDateFormatted(),
            accrual_Table: oData.items.map(function(item, index) {
                var cdIndicator1 = "";
                if (item.creditDebit === "Debit") {
                    cdIndicator1 = "D";
                } else if (item.creditDebit === "Credit") {
                    cdIndicator1 = "C";
                }
                return {
                    itemNumber: (index + 1).toString() || "",
                    supplierCustomer: item.supplier || "",
                    purchaseOrderNumber: item.poNumber || "",
                    purchaseOrderLineItem: item.poLineItem || "",
                    description: item.description || "",
                    currency: item.currency || "",
                    excludeTax: item.excludeTax ? item.excludeTax.toString() : "",
                    gLAccountCode: item.glAccount || "",
                    creditDebitIndicator: item.creditDebit || "",
                    cDIndicator: cdIndicator1,
                    costCentre: item.costCentre || "",
                    internalOrder: item.internalOrder || "",
                    wBS: item.wbs || "",
                    tradingPartner: item.tradingPartner || "",
                    salesOrderNumber: item.salesOrder || "",
                    salesOrderItemNumber: item.salesOrderItem || "",
                    segmentProduct: item.SegmentProduct || "",
                    segmentShiptoParty: item.segmentShip || "",
                    segmentSoldtoParty: item.segmentSold || ""
                };
            })
        }
    };

    return payload;
},

        onPONumberChange: function(oEvent) {
    var that = this;
    var oComboBox = oEvent.getSource();
    var sPurchaseOrder = oComboBox.getSelectedKey();
    var oContext = oComboBox.getBindingContext();
    
    if (!oContext || !sPurchaseOrder) {
        return;
    }
    
    var oModel = this.getView().getModel();
    var sPath = oContext.getPath();
    
    // Clear existing PO line item data
    oModel.setProperty(sPath + "/poLineItem", "");
    oModel.setProperty(sPath + "/description", "");
    oModel.setProperty(sPath + "/excludeTax", "");
    oModel.setProperty(sPath + "/purchaseOrderItems", []);
    
    oComboBox.setBusy(true);
    
    this._fetchPurchaseOrderItems(sPurchaseOrder)
        .then(function(aPOItems) {
            if (aPOItems && aPOItems.length > 0) {
                oModel.setProperty(sPath + "/purchaseOrderItems", aPOItems);
                
                // Auto-populate with first item
                var firstItem = aPOItems[0];
                oModel.setProperty(sPath + "/poLineItem", firstItem.PurchaseOrderItem);
                oModel.setProperty(sPath + "/description", firstItem.PurchaseOrderItemText);
                oModel.setProperty(sPath + "/excludeTax", firstItem.NetAmount);
                
                MessageToast.show("PO Line Item details auto-populated");
            } else {
                MessageToast.show("No line items found for this PO");
            }
        })
        .catch(function(error) {
            console.error("Error loading PO items:", error);
            MessageToast.show("Failed to load PO items");
        })
        .finally(function() {
            oComboBox.setBusy(false);
        });
},

onPOLineItemChange: function(oEvent) {
    var oComboBox = oEvent.getSource();
    var sSelectedItem = oComboBox.getSelectedKey();
    var oContext = oComboBox.getBindingContext();
    
    if (!oContext || !sSelectedItem) {
        return;
    }
    
    var oModel = this.getView().getModel();
    var sPath = oContext.getPath();
    var aPOItems = oModel.getProperty(sPath + "/purchaseOrderItems");
    
    if (aPOItems && aPOItems.length > 0) {
        var selectedPOItem = aPOItems.find(function(item) {
            return item.PurchaseOrderItem === sSelectedItem;
        });
        
        if (selectedPOItem) {
            oModel.setProperty(sPath + "/description", selectedPOItem.PurchaseOrderItemText);
            oModel.setProperty(sPath + "/excludeTax", selectedPOItem.NetAmount);
            
            MessageToast.show("Description and Amount updated");
        }
    }
},


        _createEmptyItem: function() {
                return {
        supplier: "",
        supplierNumber: "",
        description: "",
        currency: "",
        excludeTax: "",
        glAccount: "",
        creditDebit: "",
        poNumber: "",
        poLineItem: "",              // NEW FIELD
        costCentre: "",
        internalOrder: "",
        wbs: "",
        tradingPartner: "",
        salesOrder: "",
        salesOrderItem: "",
        SegmentProduct: "",
        segmentShip: "",
        segmentSold: "",
        purchaseOrders: [],
        purchaseOrderItems: [],      // NEW ARRAY
        salesOrderItems: [],
        supplierState: "None",
        supplierStateText: "",
        descriptionState: "None",
        descriptionStateText: "",
        currencyState: "None",
        currencyStateText: "",
        excludeTaxState: "None",
        excludeTaxStateText: "",
        glAccountState: "None",
        glAccountStateText: "",
        creditDebitState: "None",
        creditDebitStateText: ""
      };
    },

onAffiliateChange: function(oEvent) {
    var that = this;
    var oSource = oEvent.getSource();
    var sSelectedAffiliate = oSource.getSelectedKey();
    var oModel = this.getView().getModel();
    
    oSource.setValueState("None");
    oSource.setValueStateText("");
    
    if (!sSelectedAffiliate) {
        oModel.setProperty("/companyCode", "");
        oModel.setProperty("/currency", "");
        oModel.setProperty("/costCentres", []);
        oModel.setProperty("/costCentresLoaded", false);
        oModel.setProperty("/internalOrders", []);
        oModel.setProperty("/internalOrdersLoaded", false);
        oModel.setProperty("/currencies", []);
        oModel.setProperty("/currenciesLoaded", false);
        return;
    }
    
    var oMapping = oModel.getProperty("/affiliateToCompanyCodeMap");
    var sCompanyCode = oMapping[sSelectedAffiliate] || "";
    
    oModel.setProperty("/companyCode", sCompanyCode);
    
    var oCompanyCodeInput = this.byId("companyCodeInput");
    if (oCompanyCodeInput) {
        oCompanyCodeInput.setValueState("None");
        oCompanyCodeInput.setValueStateText("");
    }
    
    if (sCompanyCode) {
        sap.ui.core.BusyIndicator.show(0);
        
        // Load currencies silently in the background (no busy indicator on field)
        var bCurrenciesLoaded = oModel.getProperty("/currenciesLoaded");
        if (!bCurrenciesLoaded) {
            this._fetchCurrencies()
                .then(function(currencies) {
                    if (currencies && currencies.length > 0) {
                        oModel.setProperty("/currencies", currencies);
                        oModel.setProperty("/currenciesLoaded", true);
                        console.log("Currencies loaded in background:", currencies.length);
                    }
                })
                .catch(function(error) {
                    console.error("Error loading currencies in background:", error);
                });
        }
        
        this._fetchCurrencyFromCostCenter(sCompanyCode)
            .then(function(currency) {
                if (currency) {
                    oModel.setProperty("/currency", currency);
                    
                    var aItems = oModel.getProperty("/items");
                    aItems.forEach(function(item, index) {
                        oModel.setProperty("/items/" + index + "/currency", currency);
                    });
                    
                    MessageToast.show("Company Code " + sCompanyCode + " and Currency " + currency + " automatically selected");
                } else {
                    MessageToast.show("Company Code " + sCompanyCode + " selected. Currency could not be fetched.");
                }
                
                return that._fetchGLAccounts(sCompanyCode);
            })
            .then(function(glAccounts) {
                if (glAccounts && glAccounts.length > 0) {
                    oModel.setProperty("/glAccounts", glAccounts);
                    oModel.setProperty("/glAccountsLoaded", true);
                }
                
                return that._fetchCostCentres(sCompanyCode);
            })
            .then(function(costCentres) {
                if (costCentres && costCentres.length > 0) {
                    oModel.setProperty("/costCentres", costCentres);
                    oModel.setProperty("/costCentresLoaded", true);
                }
                
                return that._fetchInternalOrders(sCompanyCode);
            })
            .then(function(internalOrders) {
                if (internalOrders && internalOrders.length > 0) {
                    oModel.setProperty("/internalOrders", internalOrders);
                    oModel.setProperty("/internalOrdersLoaded", true);
                }
            })
            .catch(function(error) {
                console.error("Error in affiliate change handler:", error);
                MessageBox.error("Failed to fetch data for selected affiliate.");
            })
            .finally(function() {
                sap.ui.core.BusyIndicator.hide();
            });
    }
},

        onTypeOfPartyChange: function(oEvent) {
            var oSelect = oEvent.getSource();
            var sSelectedType = oSelect.getSelectedKey();
            
            oSelect.setValueState("None");
            oSelect.setValueStateText("");
            
            if (sSelectedType) {
                MessageToast.show(sSelectedType + " type selected.");
            }
        },

        onRequestTypeChange: function(oEvent) {
    var oSelect = oEvent.getSource();
    var sSelectedType = oSelect.getSelectedKey();
    var oModel = this.getView().getModel();
    
    // Clear value state
    oSelect.setValueState("None");
    oSelect.setValueStateText("");
    
    if (sSelectedType === "Reclass") {
        var aItems = oModel.getProperty("/items");
        
        // If more than 2 rows exist, trim to 2
        if (aItems.length > 2) {
            MessageBox.confirm(
                "Reclass request allows maximum 2 line items. " +
                "Current items will be trimmed to 2. Do you want to continue?",
                {
                    onClose: function(sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            aItems = aItems.slice(0, 2);
                            oModel.setProperty("/items", aItems);
                            MessageToast.show("Line items trimmed to 2 for Reclass request");
                        } else {
                            // Revert back to Accrual
                            oModel.setProperty("/requestType", "Accrual");
                            oSelect.setSelectedKey("Accrual");
                        }
                    }
                }
            );
        } else if (aItems.length === 1) {
            // Add second empty row automatically for Reclass
            var sCurrency = oModel.getProperty("/currency");
            var newItem = this._createEmptyItem();
            if (sCurrency) {
                newItem.currency = sCurrency;
            }
            aItems.push(newItem);
            oModel.setProperty("/items", aItems);
            MessageToast.show("Reclass selected - 2 line items required");
        } else {
            MessageToast.show("Reclass selected - maximum 2 line items allowed");
        }
    }
},

onAddRow: function() {
    var oModel = this.getView().getModel();
    var aItems = oModel.getProperty("/items");
    var sCurrency = oModel.getProperty("/currency");
    var sRequestType = oModel.getProperty("/requestType");
    
    // Restrict to 2 rows for Reclass
    if (sRequestType === "Reclass" && aItems.length >= 2) {
        MessageBox.warning("Reclass request can have a maximum of 2 line items only.");
        return;
    }
    
    var newItem = this._createEmptyItem();
    if (sCurrency) {
        newItem.currency = sCurrency;
    }
    
    aItems.push(newItem);
    oModel.setProperty("/items", aItems);
    
    MessageToast.show("New row added");
},

        onDeleteRow: function(oEvent) {
            var that = this;
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items");
            
            if (aItems.length === 1) {
                MessageBox.warning("At least one row is required.");
                return;
            }
            
            var oButton = oEvent.getSource();
            var oContext = oButton.getBindingContext();
            var sPath = oContext.getPath();
            var iIndex = parseInt(sPath.split("/").pop());
            
            MessageBox.confirm("Are you sure you want to delete this row?", {
                onClose: function(sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        aItems.splice(iIndex, 1);
                        oModel.setProperty("/items", aItems);
                        MessageToast.show("Row deleted");
                    }
                }
            });
        },

        onSelectionChange: function(oEvent) {
            var oTable = this.byId("itemsTable");
            var aSelectedItems = oTable.getSelectedItems();
            var oModel = this.getView().getModel();
            
            oModel.setProperty("/selectedItemsCount", aSelectedItems.length);
        },

        onDeleteSelected: function() {
            var that = this;
            var oTable = this.byId("itemsTable");
            var aSelectedItems = oTable.getSelectedItems();
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items");
            
            if (aItems.length - aSelectedItems.length < 1) {
                MessageBox.warning("At least one row must remain.");
                return;
            }
            
            MessageBox.confirm("Delete " + aSelectedItems.length + " row(s)?", {
                onClose: function(sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        var aIndicesToDelete = [];
                        aSelectedItems.forEach(function(oItem) {
                            var sPath = oItem.getBindingContextPath();
                            var iIndex = parseInt(sPath.split("/").pop());
                            aIndicesToDelete.push(iIndex);
                        });
                        
                        aIndicesToDelete.sort(function(a, b) {
                            return b - a;
                        });
                        
                        aIndicesToDelete.forEach(function(iIndex) {
                            aItems.splice(iIndex, 1);
                        });
                        
                        oModel.setProperty("/items", aItems);
                        oModel.setProperty("/selectedItemsCount", 0);
                        oTable.removeSelections(true);
                        
                        MessageToast.show(aIndicesToDelete.length + " row(s) deleted");
                    }
                }
            });
        },

        onFieldChange: function(oEvent) {
            var oSource = oEvent.getSource();
            oSource.setValueState("None");
            oSource.setValueStateText("");
        },

        onTableFieldChange: function(oEvent) {
            var oSource = oEvent.getSource();
            var oContext = oSource.getBindingContext();
            
            if (!oContext) {
                return;
            }
            
            var sPath = oContext.getPath();
            var oModel = this.getView().getModel();
            
            var sFieldName = oSource.getBinding("value") ? 
                oSource.getBinding("value").getPath() : 
                oSource.getBinding("selectedKey").getPath();
            
            var sStatePath = sPath + "/" + sFieldName + "State";
            var sStateTextPath = sPath + "/" + sFieldName + "StateText";
            
            oModel.setProperty(sStatePath, "None");
            oModel.setProperty(sStateTextPath, "");
        },

        onPONumberOpen: function(oEvent) {
            var that = this;
            var oComboBox = oEvent.getSource();
            var oContext = oComboBox.getBindingContext();
            var oModel = this.getView().getModel();
            
            if (!oContext) {
                return;
            }
            
            var sPath = oContext.getPath();
            var oItem = oModel.getProperty(sPath);
            var sSupplierNumber = oItem.supplierNumber;
            var sTypeOfParty = oModel.getProperty("/typeOfParty");
            
            if (sTypeOfParty !== "Supplier") {
                return;
            }
            
            if (!sSupplierNumber) {
                MessageToast.show("Please select a supplier first");
                return;
            }
            
            if (oItem.purchaseOrders && oItem.purchaseOrders.length > 0) {
                return;
            }
            
            oComboBox.setBusy(true);
            
            this._fetchPurchaseOrders(sSupplierNumber)
                .then(function(aPurchaseOrders) {
                    oModel.setProperty(sPath + "/purchaseOrders", aPurchaseOrders);
                    
                    if (aPurchaseOrders.length === 0) {
                        MessageToast.show("No purchase orders found");
                    }
                })
                .catch(function(error) {
                    console.error("Error loading purchase orders:", error);
                    MessageToast.show("Failed to load purchase orders");
                })
                .finally(function() {
                    oComboBox.setBusy(false);
                });
        },

        onCostCentreOpen: function(oEvent) {
            var that = this;
            var oModel = this.getView().getModel();
            var bLoaded = oModel.getProperty("/costCentresLoaded");
            var sCompanyCode = oModel.getProperty("/companyCode");
            
            if (!sCompanyCode) {
                MessageToast.show("Please select an affiliate first");
                return;
            }
            
            if (!bLoaded) {
                var oComboBox = oEvent.getSource();
                oComboBox.setBusy(true);
                
                this._fetchCostCentres(sCompanyCode)
                    .then(function(costCentres) {
                        if (costCentres && costCentres.length > 0) {
                            oModel.setProperty("/costCentres", costCentres);
                            oModel.setProperty("/costCentresLoaded", true);
                        }
                        oComboBox.setBusy(false);
                    })
                    .catch(function(error) {
                        console.error("Error loading cost centres:", error);
                        oComboBox.setBusy(false);
                    });
            }
        },

        onInternalOrderOpen: function(oEvent) {
            var that = this;
            var oModel = this.getView().getModel();
            var bLoaded = oModel.getProperty("/internalOrdersLoaded");
            var sCompanyCode = oModel.getProperty("/companyCode");
            
            if (!sCompanyCode) {
                MessageToast.show("Please select an affiliate first");
                return;
            }
            
            if (!bLoaded) {
                var oComboBox = oEvent.getSource();
                oComboBox.setBusy(true);
                
                this._fetchInternalOrders(sCompanyCode)
                    .then(function(internalOrders) {
                        if (internalOrders && internalOrders.length > 0) {
                            oModel.setProperty("/internalOrders", internalOrders);
                            oModel.setProperty("/internalOrdersLoaded", true);
                        }
                        oComboBox.setBusy(false);
                    })
                    .catch(function(error) {
                        console.error("Error loading internal orders:", error);
                        oComboBox.setBusy(false);
                    });
            }
        },

        onSalesOrderOpen: function(oEvent) {
            var that = this;
            var oModel = this.getView().getModel();
            var bLoaded = oModel.getProperty("/salesOrdersLoaded");
            
            if (!bLoaded) {
                var oComboBox = oEvent.getSource();
                oComboBox.setBusy(true);
                
                this._fetchSalesOrders()
                    .then(function(salesOrders) {
                        if (salesOrders && salesOrders.length > 0) {
                            oModel.setProperty("/salesOrders", salesOrders);
                            oModel.setProperty("/salesOrdersLoaded", true);
                        }
                        oComboBox.setBusy(false);
                    })
                    .catch(function(error) {
                        console.error("Error loading sales orders:", error);
                        oComboBox.setBusy(false);
                    });
            }
        },

        onSalesOrderChange: function(oEvent) {
            var that = this;
            var oComboBox = oEvent.getSource();
            var sSalesOrder = oComboBox.getSelectedKey();
            var oContext = oComboBox.getBindingContext();
            
            if (!oContext || !sSalesOrder) {
                return;
            }
            
            var oModel = this.getView().getModel();
            var sPath = oContext.getPath();
            
            oComboBox.setBusy(true);
            
            this._fetchSalesOrderItems(sSalesOrder)
                .then(function(aItems) {
                    if (aItems && aItems.length > 0) {
                        var firstItem = aItems[0];
                        oModel.setProperty(sPath + "/salesOrderItem", firstItem.SalesOrderItem || "");
                        oModel.setProperty(sPath + "/salesOrderItems", aItems);
                    }
                    
                    return that._fetchSegmentData(sSalesOrder);
                })
                .then(function(segmentData) {
                    if (segmentData) {
                        oModel.setProperty(sPath + "/SegmentProduct", segmentData.Product);
                        oModel.setProperty(sPath + "/segmentShip", segmentData.ShipToParty);
                        oModel.setProperty(sPath + "/segmentSold", segmentData.SoldToParty);
                        
                        MessageToast.show("Sales Order details auto-populated");
                    }
                })
                .catch(function(error) {
                    console.error("Error loading sales order details:", error);
                    MessageToast.show("Failed to load sales order details");
                })
                .finally(function() {
                    oComboBox.setBusy(false);
                });
        },


        _fetchBusinessPartners: function(searchTerm) {
            var oModel = this.getView().getModel();
            var sTypeOfParty = oModel.getProperty("/typeOfParty");
            
            if (!sTypeOfParty) {
                MessageToast.show("Please select Type of Party first");
                return Promise.resolve([]);
            }
            
            var endpoint = this._getBusinessPartnerEndpoint(sTypeOfParty);
            var filter = "";
            
            if (sTypeOfParty === "Customer") {
                filter = searchTerm 
                    ? "?$filter=substringof('" + encodeURIComponent(searchTerm) + "',CustomerName)&$top=20"
                    : "?$top=20";
            } else if (sTypeOfParty === "Supplier") {
                filter = searchTerm 
                    ? "?$filter=substringof('" + encodeURIComponent(searchTerm) + "',SupplierName)&$top=20"
                    : "?$top=20";
            } else {
                filter = searchTerm 
                    ? "?$filter=substringof('" + encodeURIComponent(searchTerm) + "',BusinessPartnerName)&$top=20"
                    : "?$top=20";
            }
            
            var url = endpoint + filter;
            
            return fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": "Basic " + btoa(this._businessPartnerConfig.Username + ":" + this._businessPartnerConfig.Password),
                    "Accept": "application/json"
                }
            })
            .then(function(response) {
                if (!response.ok) {
                    return [];
                }
                return response.json();
            })
            .then(function(data) {
                if (data && data.d && data.d.results) {
                    if (sTypeOfParty === "Customer") {
                        return data.d.results.map(function(partner) {
                            return {
                                key: partner.Customer || "",
                                name: partner.CustomerName || "",
                                fullText: (partner.Customer || "") + " - " + (partner.CustomerName || "")
                            };
                        });
                    } else if (sTypeOfParty === "Supplier") {
                        return data.d.results.map(function(partner) {
                            return {
                                key: partner.Supplier || "",
                                name: partner.SupplierName || "",
                                fullText: (partner.Supplier || "") + " - " + (partner.SupplierName || "")
                            };
                        });
                    } else {
                        return data.d.results.map(function(partner) {
                            return {
                                key: partner.BusinessPartner || "",
                                name: partner.BusinessPartnerName || "",
                                fullText: (partner.BusinessPartner || "") + " - " + (partner.BusinessPartnerName || "")
                            };
                        });
                    }
                }
                return [];
            })
            .catch(function(error) {
                console.error("Error fetching business partners:", error);
                return [];
            });
        },

        onSupplierSuggest: function(oEvent) {
            var that = this;
            var sSuggestValue = oEvent.getParameter("suggestValue");
            var oSource = oEvent.getSource();
            var oModel = this.getView().getModel();
            var sTypeOfParty = oModel.getProperty("/typeOfParty");
            
            if (!sTypeOfParty) {
                MessageBox.warning("Please select Type of Party first");
                return;
            }
            
            if (!sSuggestValue || sSuggestValue.length <= 0) {
                return;
            }
            
            oSource.setBusy(true);
            
            this._fetchBusinessPartners(sSuggestValue)
                .then(function(aPartners) {
                    oSource.destroySuggestionItems();
                    
                    aPartners.forEach(function(partner) {
                        oSource.addSuggestionItem(
                            new sap.ui.core.Item({
                                key: partner.key,
                                text: partner.fullText
                            })
                        );
                    });
                    
                    oSource.setBusy(false);
                })
                .catch(function(error) {
                    console.error("Error in suggestion:", error);
                    oSource.setBusy(false);
                });
        },

onSupplierSuggestionSelected: function(oEvent) {
    var that = this;
    var oSelectedItem = oEvent.getParameter("selectedItem");
    
    if (oSelectedItem) {
        var sSelectedText = oSelectedItem.getText();
        var oSource = oEvent.getSource();
        var oContext = oSource.getBindingContext();
        var oModel = this.getView().getModel();
        
        var parts = sSelectedText.split(" - ");
        var supplierCustomerNumber = parts[0];
        var name = parts[1] || sSelectedText;
        
        oSource.setValue(name);
        
        var sTypeOfParty = oModel.getProperty("/typeOfParty");
        
        // ADD THIS LINE - Store the first supplier/customer number at header level
        if (!oModel.getProperty("/csNumber")) {
            oModel.setProperty("/csNumber", supplierCustomerNumber);
        }
        
        if (oContext) {
            var sPath = oContext.getPath();
            
            oModel.setProperty(sPath + "/supplierNumber", supplierCustomerNumber);
            
            oSource.setBusy(true);
            
            this._fetchGLAccountForSupplierCustomer(
                supplierCustomerNumber, 
                sTypeOfParty
            )
            .then(function(glAccount) {
                if (glAccount) {
                    oModel.setProperty(sPath + "/glAccount", glAccount);
                    MessageToast.show("GL Account " + glAccount + " auto-populated");
                }
                
                if (sTypeOfParty === "Supplier") {
                    return that._fetchPurchaseOrders(supplierCustomerNumber);
                }
                return [];
            })
            .then(function(aPurchaseOrders) {
                if (sTypeOfParty === "Supplier") {
                    oModel.setProperty(sPath + "/purchaseOrders", aPurchaseOrders);
                    
                    if (aPurchaseOrders.length > 0) {
                        console.log("Loaded " + aPurchaseOrders.length + " purchase orders");
                    }
                }
            })
            .finally(function() {
                oSource.setBusy(false);
            });
        }
    }
},

        onGLAccountSuggest: function(oEvent) {
            var that = this;
            var oSource = oEvent.getSource();
            var oModel = this.getView().getModel();
            var aGLAccounts = oModel.getProperty("/glAccounts");
            
            if (!aGLAccounts || aGLAccounts.length === 0) {
                var sCompanyCode = oModel.getProperty("/companyCode");
                if (sCompanyCode) {
                    oSource.setBusy(true);
                    this._fetchGLAccounts(sCompanyCode)
                        .then(function(glAccounts) {
                            if (glAccounts && glAccounts.length > 0) {
                                oModel.setProperty("/glAccounts", glAccounts);
                                oModel.setProperty("/glAccountsLoaded", true);
                                
                                oSource.destroySuggestionItems();
                                glAccounts.forEach(function(account) {
                                    oSource.addSuggestionItem(
                                        new sap.ui.core.Item({
                                            key: account.GLAccount,
                                            text: account.displayText
                                        })
                                    );
                                });
                            }
                            oSource.setBusy(false);
                        })
                        .catch(function(error) {
                            console.error("Error loading GL accounts:", error);
                            oSource.setBusy(false);
                        });
                } else {
                    MessageToast.show("Please select an affiliate first");
                }
            }
        },

_validateHeaderFields: function() {
    var bValid = true;
    var aRequiredFields = [
        { id: "Copy_affiliateSelect", name: "Affiliate" },
        { id: "Copy_nameAccrualInput", name: "Name your accrual" },
        { id: "Copy_cutoffDatePicker", name: "Accrual cut-off date" },
        { id: "Copy_companyCodeInput", name: "Company code" },
        { id: "Copy_requestedByInput", name: "Requested by" },
        { id: "Copy_approvedByInput", name: "Approved by" },
        { id: "Copy_requestTypeSelect", name: "Type of request" },
        { id: "Copy_typeOfPartySelect", name: "Type of Party" }
    ];

    aRequiredFields.forEach(function(field) {
        var oControl = this.byId(field.id);

        if (!oControl) {
            console.error("Control not found for ID: " + field.id);
            return;
        }

        var sValue = oControl.getValue ? oControl.getValue() : oControl.getSelectedKey();

        if (!sValue || sValue.trim() === "") {
            oControl.setValueState("Error");
            oControl.setValueStateText(field.name + " is required");
            bValid = false;
        } else {
            oControl.setValueState("None");
            oControl.setValueStateText("");
        }
    }, this);

    return bValid;
},

        _validateTableItems: function() {
            var bValid = true;
            var oModel = this.getView().getModel();
            var aItems = oModel.getProperty("/items");

            if (aItems.length === 0) {
                MessageBox.error("At least one line item is required");
                return false;
            }

            var sRequestType = oModel.getProperty("/requestType");
if (sRequestType === "Reclass" && aItems.length > 2) {
    MessageBox.error("Reclass request can have a maximum of 2 line items only.");
    return false;
}

            var aRequiredFields = [
                { field: "supplier", label: "Supplier/Customer" },
                { field: "description", label: "Description" },
                { field: "currency", label: "Currency" },
                { field: "excludeTax", label: "Exclude Tax" },
                { field: "glAccount", label: "GL Account Code" },
                { field: "creditDebit", label: "Credit/Debit Indicator" }
            ];

            aItems.forEach(function(item, index) {
                aRequiredFields.forEach(function(reqField) {
                    var sValue = item[reqField.field];
                    var sStateProp = reqField.field + "State";
                    var sStateTextProp = reqField.field + "StateText";
                    
                    if (!sValue || sValue.toString().trim() === "") {
                        item[sStateProp] = "Error";
                        item[sStateTextProp] = reqField.label + " is required";
                        bValid = false;
                    } else {
                        item[sStateProp] = "None";
                        item[sStateTextProp] = "";
                    }
                });
                
                if (item.excludeTax && isNaN(item.excludeTax)) {
                    item.excludeTaxState = "Error";
                    item.excludeTaxStateText = "Must be a valid number";
                    bValid = false;
                }
            });

            oModel.setProperty("/items", aItems);
            return bValid;
        },

_validateCutoffDate: function() {
    var oDatePicker = this.byId("Copy_cutoffDatePicker");
    var sDate = oDatePicker.getValue();

    var dateRegex = /^\d{8}$/;

    if (!dateRegex.test(sDate)) {
        oDatePicker.setValueState("Error");
        oDatePicker.setValueStateText("Date must be in format yyyymmdd");
        return false;
    }

    var year = parseInt(sDate.substring(0, 4));
    var month = parseInt(sDate.substring(4, 6));
    var day = parseInt(sDate.substring(6, 8));

    var date = new Date(year, month - 1, day);

    if (date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day) {
        oDatePicker.setValueState("Error");
        oDatePicker.setValueStateText("Invalid date");
        return false;
    }

    var lastDayOfMonth = new Date(year, month, 0).getDate();

    if (day !== lastDayOfMonth) {
        oDatePicker.setValueState("Error");
        oDatePicker.setValueStateText("Must be a month-end date. Last day is " + lastDayOfMonth);
        return false;
    }

    oDatePicker.setValueState("None");
    return true;
},

_preparePayloadForProcessAutomation: function(oData, iStatus) {
    var payload = {
        definitionId: "us10.e84e1793trial.infineumaccrual4.accrual_Process",
        context: {
            accrual: {
                Affiliate: oData.affiliate || "",
                CompanyCode: oData.companyCode || "",
                NameYourAccrual: oData.nameAccrual || "",
                RequestedBy: oData.requestedBy || "",
                ApprovedBy: oData.approvedBy || "",
                AccrualCutOffDate: oData.cutoffDate || "",
                TypeofRequest: oData.requestType || "",
                Partytype: oData.typeOfParty || "",
                CSNumber: oData.csNumber || "",
                Createddate: this._getCurrentDateFormatted(),  // NEW FIELD
                Status: iStatus.toString(),
                Supporting_Documents: oData.dmsFolderId
    ? "spa-res:cmis:folderid:" + oData.dmsFolderId
    : "",
                Accrual_Table: oData.items.map(function(item, index) {
                    var cdIndicator = "";
                    if (item.creditDebit === "Debit") {
                        cdIndicator = "D";
                    } else if (item.creditDebit === "Credit") {
                        cdIndicator = "C";
                    }
                    
                    return {
                        ItemnoAcc: (index + 1).toString(),
                        SupplierCustomer: item.supplier || "",
                        Description: item.description || "",
                        Currency: item.currency || "",
                        ExcludeTax: item.excludeTax ? item.excludeTax.toString() : "",
                        GLAccountCode: item.glAccount || "",
                        CreditDebitIndicator: item.creditDebit || "",
                        Cdindicator: cdIndicator,
                        PurchaseOrderNumber: item.poNumber || "",
                        PurchaseOrderLineItem: item.poLineItem || "",
                        CostCentre: item.costCentre || "",
                        InternalOrder: item.internalOrder || "",
                        WBS: item.wbs || "",
                        TradingPartner: item.tradingPartner || "",
                        SalesOrderNumber: item.salesOrder || "",
                        SalesOrderItemNumber: item.salesOrderItem || "",
                        SegmentProduct: item.SegmentProduct || "",
                        SegmentShiptoParty: item.segmentShip || "",
                        SegmentSoldtoParty: item.segmentSold || ""
                    };
                })
            }
        }
    };
    
    return payload;
},

        
onSubmit: function () {

    var that = this;

    var bHeaderValid = this._validateHeaderFields();
    var bDateValid = this._validateCutoffDate();
    var bTableValid = this._validateTableItems();

    if (!bHeaderValid || !bDateValid || !bTableValid) {
        MessageBox.error("Please fill in all required fields correctly");
        return;
    }

    var oModel = this.getView().getModel();
    var oData = oModel.getData();

    sap.ui.core.BusyIndicator.show(0);

    var workflowInstanceId = null;

    WorkflowAPI.triggerWorkflow(
        this._preparePayloadForProcessAutomation(oData, 1)
    )

    .then(function(result){

        console.log("Workflow created successfully:", result);

        workflowInstanceId = result.id;

        if (!workflowInstanceId) {
            throw new Error("Workflow created but no instance ID returned");
        }

        return WorkflowAPI.getTaskInstanceByWorkflowId(workflowInstanceId, 10, 3000);
    })

    .then(function(taskInstanceId){

        if (!taskInstanceId) {
            throw new Error("No READY form found after workflow creation");
        }

        console.log("Found READY task instance:", taskInstanceId);

        return WorkflowAPI.patchTaskInstance(
            taskInstanceId,
            that._preparePayloadForPatch(oData, 1)
        );
    })

    .then(function(){

        sap.ui.core.BusyIndicator.hide();

        MessageBox.success(
            "Request submitted successfully!",
            {
                onClose: function () {
                    that.getOwnerComponent().getRouter().navTo("Dashboard");
                }
            }
        );
    })

    .catch(function(error){

        sap.ui.core.BusyIndicator.hide();

        console.error("Submit workflow error:", error);

        MessageBox.error("Failed to submit request:\n\n" + error.message);
    });
},

onSaveAsDraft: function () {

    var that = this;

    if (!this._validateHeaderFields() ||
        !this._validateCutoffDate() ||
        !this._validateTableItems()) {

        MessageBox.error("Please fill in all required fields correctly");
        return;
    }

    var oModel = this.getView().getModel();
    var oData = oModel.getData();

    sap.ui.core.BusyIndicator.show(0);

    var workflowInstanceId = null;

    WorkflowAPI.triggerWorkflow(
        this._preparePayloadForProcessAutomation(oData, 2)
    )

    .then(function(result){

        workflowInstanceId = result.id;

        if(!workflowInstanceId){
            throw new Error("Workflow created but no instance ID returned");
        }

        return WorkflowAPI.getTaskInstanceByWorkflowId(workflowInstanceId,10,3000);

    })

    .then(function(taskInstanceId){

        if(!taskInstanceId){
            throw new Error("No READY form found after workflow creation");
        }

        return WorkflowAPI.patchTaskInstance(
            taskInstanceId,
            that._preparePayloadForPatch(oData,2)
        );

    })

    .then(function(){

        sap.ui.core.BusyIndicator.hide();

        MessageBox.success("Request saved as draft successfully!",{
            onClose:function(){
                that.getOwnerComponent().getRouter().navTo("Dashboard");
            }
        });

    })

    .catch(function(error){

        sap.ui.core.BusyIndicator.hide();

        console.error("Save as Draft workflow error:",error);

        MessageBox.error("Failed to save draft:\n\n"+error.message);

    });
},

onDMSFileSelected: function(oEvent) {
    var that = this;
    var oFileUploader = oEvent.getSource();
    var oFile = oFileUploader.oFileUpload.files[0];
    var oModel = this.getView().getModel();

    if (!oFile) return;

    // Always generate a unique folder name to avoid 409 conflicts
    var sFolderName = "accrual_copy_" + Date.now();
    sap.ui.core.BusyIndicator.show(0);

    var sToken = null;
    var cfg = WorkflowAPI._dmsConfig;
    var ep = cfg.endpoints();

    // Step 1: Get token once
    WorkflowAPI.getDMSToken()
        .then(function(token) {
            sToken = token;

            // Step 2: Create folder with unique name
            var formData = new FormData();
            formData.append("cmisaction", "createFolder");
            formData.append("propertyId[0]", "cmis:objectTypeId");
            formData.append("propertyValue[0]", "cmis:folder");
            formData.append("propertyId[1]", "cmis:name");
            formData.append("propertyValue[1]", sFolderName);
            formData.append("succinct", "true");

            return fetch(ep.createFolder, {
                method: "POST",
                headers: { "Authorization": "Bearer " + sToken },
                body: formData
            });
        })
        .then(function(r) {
            if (!r.ok) throw new Error("Create folder failed: " + r.status);
            return r.json();
        })
        .then(function(data) {
            var objectId = data && data.succinctProperties && data.succinctProperties["cmis:objectId"];
            if (!objectId) throw new Error("cmis:objectId not found in folder response");

            // Store folder ID in model
            oModel.setProperty("/dmsFolderId", objectId);

            // Step 3: Upload file into the new folder using same token
            var uploadUrl = ep.createDocument + "/" + encodeURIComponent(sFolderName);

            var uploadFormData = new FormData();
            uploadFormData.append("cmisaction", "createDocument");
            uploadFormData.append("propertyId[0]", "cmis:name");
            uploadFormData.append("propertyValue[0]", oFile.name);
            uploadFormData.append("propertyId[1]", "cmis:objectTypeId");
            uploadFormData.append("propertyValue[1]", "cmis:document");
            uploadFormData.append("filename", oFile.name);
            uploadFormData.append("charset", "UTF-8");
            uploadFormData.append("includeAllowableActions", "true");
            uploadFormData.append("succinct", "true");
            uploadFormData.append("media", oFile);

            return fetch(uploadUrl, {
                method: "POST",
                headers: { "Authorization": "Bearer " + sToken },
                body: uploadFormData
            });
        })
        .then(function(r) {
            if (!r.ok) throw new Error("Upload failed: " + r.status);
            return r.json();
        })
        .then(function(data) {
            var fileObjectId = data.succinctProperties
                && data.succinctProperties["cmis:objectId"] || "temp_id";

            var aDocs = oModel.getProperty("/dmsDocuments") || [];
            aDocs.push({
                objectId: fileObjectId,
                fileName: oFile.name,
                fileType: oFile.name.split(".").pop().toUpperCase(),
                fileSize: oFile.size < 1024 ? oFile.size + " B"
                    : oFile.size < 1048576 ? Math.round(oFile.size / 1024) + " KB"
                    : Math.round(oFile.size / 1048576 * 10) / 10 + " MB",
                uploadedOn: new Date().toLocaleDateString()
            });
            oModel.setProperty("/dmsDocuments", aDocs);
            MessageToast.show("File uploaded successfully");
        })
        .catch(function(error) {
            console.error("DMS Upload error:", error);
            MessageBox.error("Upload failed: " + error.message);
        })
        .finally(function() {
            sap.ui.core.BusyIndicator.hide();
            oFileUploader.clear();
        });
},

onDMSDownload: function(oEvent) {
    var oDoc = oEvent.getSource().getBindingContext().getObject();

    WorkflowAPI.downloadDMSFile(oDoc.objectId)
        .then(function(blob) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement("a");
            a.href = url;
            a.download = oDoc.fileName;
            a.click();
            URL.revokeObjectURL(url);
        })
        .catch(function(error) {
            MessageBox.error("Download failed: " + error.message);
        });
},

onDMSDelete: function(oEvent) {
    var oDoc = oEvent.getSource().getBindingContext().getObject();
    var oModel = this.getView().getModel();

    MessageBox.confirm("Delete " + oDoc.fileName + "?", {
        onClose: function(sAction) {
            if (sAction !== MessageBox.Action.OK) return;
            WorkflowAPI.deleteDMSFile(oDoc.objectId)
                .then(function() {
                    var aDocs = oModel.getProperty("/dmsDocuments").filter(function(d) {
                        return d.objectId !== oDoc.objectId;
                    });
                    oModel.setProperty("/dmsDocuments", aDocs);
                    MessageToast.show("File deleted");
                })
                .catch(function(error) {
                    MessageBox.error("Delete failed: " + error.message);
                });
        }
    });
},

        onClear: function() {
            var that = this;
            var sEmail = this._getEmailFromURL();
            
            MessageBox.confirm("Are you sure you want to clear the form?", {
                onClose: function(sAction) {
                    if (sAction === MessageBox.Action.OK) {
                        var oModel = that.getView().getModel();
                        var aCompanyCodes = oModel.getProperty("/companyCodes");
                        var oMapping = oModel.getProperty("/affiliateToCompanyCodeMap");
                        var bLoaded = oModel.getProperty("/companyCodesLoaded");
                        var aSalesOrders = oModel.getProperty("/salesOrders");
                        var bSalesOrdersLoaded = oModel.getProperty("/salesOrdersLoaded");
                        var aCurrencies = oModel.getProperty("/currencies");
                        var bCurrenciesLoaded = oModel.getProperty("/currenciesLoaded");
                        
                        var oNewModel = new JSONModel({
                            affiliate: "",
                            nameAccrual: "",
                            cutoffDate: "",
                            companyCode: "",
                            requestedBy: sEmail || "",
                            approvedBy: "",
                            requestType: "",
                            typeOfParty: "",
                            csNumber: "",
                            selectedItemsCount: 0,
                            currency: "",
                            dmsDocuments: [],
                            dmsFolderId: "",
                            items: [
                                that._createEmptyItem()
                            ],
                            companyCodes: aCompanyCodes || [],
                            affiliateToCompanyCodeMap: oMapping || {},
                            companyCodesLoaded: bLoaded || false,
                            glAccounts: [],
                            glAccountsLoaded: false,
                            costCentres: [],
                            costCentresLoaded: false,
                            internalOrders: [],
                            internalOrdersLoaded: false,
                            salesOrders: aSalesOrders || [],
                            salesOrdersLoaded: bSalesOrdersLoaded || false,
                            currencies: aCurrencies || [],
                            currenciesLoaded: bCurrenciesLoaded || false
                        });
                        
                        that.getView().setModel(oNewModel);
                        that._clearValueStates();
                        
                        var oTable = that.byId("itemsTable");
                        oTable.removeSelections(true);
                        
                        MessageToast.show("Form cleared");
                    }
                }
            });
        },

_clearValueStates: function() {
    var aRequiredFields = [
        "Copy_affiliateSelect", "Copy_nameAccrualInput", "Copy_cutoffDatePicker",
        "Copy_companyCodeInput", "Copy_requestedByInput", "Copy_approvedByInput",
        "Copy_requestTypeSelect", "Copy_typeOfPartySelect"
    ];

    aRequiredFields.forEach(function(sFieldId) {
        var oControl = this.byId(sFieldId);
        if (oControl) {
            oControl.setValueState("None");
            oControl.setValueStateText("");
        }
    }, this);
},

        _refreshForm: function() {
            var sEmail = this._getEmailFromURL();
            var sMonthEndDate = this._getCurrentMonthEndDate();
            
            var oModel = this.getView().getModel();
            var aCompanyCodes = oModel.getProperty("/companyCodes");
            var oMapping = oModel.getProperty("/affiliateToCompanyCodeMap");
            var bLoaded = oModel.getProperty("/companyCodesLoaded");
            var aSalesOrders = oModel.getProperty("/salesOrders");
            var bSalesOrdersLoaded = oModel.getProperty("/salesOrdersLoaded");
            var aCurrencies = oModel.getProperty("/currencies");
            var bCurrenciesLoaded = oModel.getProperty("/currenciesLoaded");
            
            
            var oNewModel = new JSONModel({
                affiliate: "",
                nameAccrual: "",
                cutoffDate: sMonthEndDate,
                companyCode: "",
                requestedBy: sEmail || "",
                approvedBy: "",
                requestType: "",
                typeOfParty: "",
                csNumber: "",
                selectedItemsCount: 0,
                currency: "",
                dmsDocuments: [],
                dmsFolderId: "",
                items: [
                    this._createEmptyItem()
                ],
                companyCodes: aCompanyCodes || [],
                affiliateToCompanyCodeMap: oMapping || {},
                companyCodesLoaded: bLoaded || false,
                glAccounts: [],
                glAccountsLoaded: false,
                costCentres: [],
                costCentresLoaded: false,
                internalOrders: [],
                internalOrdersLoaded: false,
                salesOrders: aSalesOrders || [],
                salesOrdersLoaded: bSalesOrdersLoaded || false,
                currencies: aCurrencies || [],
                currenciesLoaded: bCurrenciesLoaded || false
            });
            
            this.getView().setModel(oNewModel);
            this._clearValueStates();
            
            var oTable = this.byId("itemsTable");
            if (oTable) {
                oTable.removeSelections(true);
            }
            
            window.scrollTo(0, 0);
            
            console.log("Form refreshed successfully");
        }
    });
});