sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/model/json/JSONModel",
  "sap/ui/model/Filter",
  "sap/ui/model/FilterOperator",
  "sap/m/MessageToast",
  "sap/m/MessageBox",
  "sap/m/ActionSheet",
  "sap/m/Button",
  "accrual/service/WorkflowAPI"
], function (Controller, JSONModel, Filter, FilterOperator, MessageToast, MessageBox, ActionSheet, Button, WorkflowAPI) {
  "use strict";

  return Controller.extend("accrual.controller.Dashboard", {

onInit: function () {
  const oModel = new JSONModel({
    totalrequest: 0,
    draft: 0,
    rejected: 0,
    completed: 0,
    pendingApproval: 0,
    requests: [],
    lastRefresh: null,
    filtersVisible: false  // ADD THIS LINE
  });

  this.getView().setModel(oModel);
  
  // Load data from API
  this._loadDataFromAPI();
},

onClearFilters: function () {
  // Clear the search field
  const oSearchField = this.byId("searchField");
  if (oSearchField) {
    oSearchField.setValue("");
  }

  // Clear dropdown filters
  this.byId("statusFilter").setSelectedKey("All");
  this.byId("requestTypeFilter").setSelectedKey("All");
  this.byId("partyTypeFilter").setSelectedKey("All");

  // Clear table filters
  const oTable = this.byId("requestsTable");
  const oBinding = oTable.getBinding("items");
  
  if (oBinding) {
    oBinding.filter([]);
  }

  MessageToast.show("All filters cleared");
},

    /** Refresh button handler */
onRefreshPress: function() {
  // Show message
  MessageToast.show("Refreshing entire page...");
  
  // Show busy indicator on the entire view/page
  this.getView().setBusy(true);
  
  // Show busy indicator on KPI tiles
  this.byId("TotalRequestTile").setState("Loading");
  this.byId("draftTile").setState("Loading");
  this.byId("pendingApprovalTile").setState("Loading");
  this.byId("rejectedTile").setState("Loading");
  this.byId("completedTile").setState("Loading");
  
  // Show busy indicator on table
  this.byId("requestsTable").setBusy(true);

  // Clear all filters and search
  this.byId("searchField").setValue("");
  this.byId("statusFilter").setSelectedKey("All");
  this.byId("requestTypeFilter").setSelectedKey("All");
  this.byId("partyTypeFilter").setSelectedKey("All");
  
  // Clear table filters to ensure all data is shown
  const oTable = this.byId("requestsTable");
  const oBinding = oTable.getBinding("items");
  if (oBinding) {
    oBinding.filter([]);
  }

  // Reload data from API - this will refresh all line items
  this._loadDataFromAPI();
},

_loadDataFromAPI: function() {

  this.getView().setBusy(true);

  WorkflowAPI.fetchAccrualRequests()

  .then(data => {
    this._processAPIData(data);
    this.getView().setBusy(false);
  })

  .catch(error => {

    console.error("Error loading data:", error);

    this.getView().setBusy(false);

    this.byId("TotalRequestTile").setState("Failed");
    this.byId("draftTile").setState("Failed");
    this.byId("pendingApprovalTile").setState("Failed");
    this.byId("rejectedTile").setState("Failed");
    this.byId("completedTile").setState("Failed");
    this.byId("requestsTable").setBusy(false);

    MessageBox.error(
      "Failed to load data from server.\n\nError: " + error.message
    );

  });

},

    _processAPIData: function(data) {
      const aResults = data.d && data.d.results ? data.d.results : [];
      
      // Transform API data to match our model
      const aTransformedData = aResults.map(item => {
        return {
          instantId: item.Instanceid || "",
          requestNo: item.Requestno || "",
          documentNo: item.Documentno || "",
          affiliate: item.Companyname || "",
          nameAccrual: item.Accuralname || "",
          companyCode: item.Companycode || "",
          requestedBy: item.Requestedby || "",
          approvedBy: item.Approvedby || "",
          requestType: item.Requesttype || "",
          typeOfParty: item.Partytype || "",
          status: item.Status || "",
          statusState: this._getStatusState(item.Status),
          dateCreated: this._formatDate(item.Cdate),
          lastUpdated: this._formatDate(item.Ldate),
          lastUpdatedTimestamp: item.Ldate
        };
      });

      // Sort by lastUpdatedTimestamp (newest first)
      
aTransformedData.sort((a, b) => {
  // Extract the numeric part from Request No (e.g., "AR-2025-0003" -> 3)
  const getRequestNumber = (requestNo) => {
    if (!requestNo) return 0;
    // Split by '-' and get the last part
    const parts = requestNo.split('-');
    const numericPart = parts[parts.length - 1];
    
    // Convert to integer
    return parseInt(numericPart, 10) || 0;
  };
  
  const numA = getRequestNumber(a.requestNo);
  const numB = getRequestNumber(b.requestNo);
  
  // Sort descending (highest number first)
  return numB - numA;
});

console.log("Sorted records by Request No (first 10):", aTransformedData.slice(0, 10).map(r => ({
  requestNo: r.requestNo,
  affiliate: r.affiliate,
  status: r.status
})));

      // Calculate KPI counts
      const oKPICounts = this._calculateKPICounts(aTransformedData);

      // Update model
      const oModel = this.getView().getModel();
      oModel.setProperty("/requests", aTransformedData);
      oModel.setProperty("/totalrequest", aTransformedData.length);
      oModel.setProperty("/draft", oKPICounts.draft);
      oModel.setProperty("/rejected", oKPICounts.rejected);
      oModel.setProperty("/completed", oKPICounts.completed);
      oModel.setProperty("/pendingApproval", oKPICounts.pendingApproval);
      
      // Update last refresh timestamp
      const oNow = new Date();
      oModel.setProperty("/lastRefresh", oNow.toLocaleTimeString());

      // Reset busy states
      this.byId("TotalRequestTile").setState("Loaded");
      this.byId("draftTile").setState("Loaded");
      this.byId("pendingApprovalTile").setState("Loaded");
      this.byId("rejectedTile").setState("Loaded");
      this.byId("completedTile").setState("Loaded");
      this.byId("requestsTable").setBusy(false);

      MessageToast.show("Data refreshed successfully: " + aTransformedData.length + " records");
    },

_formatDate: function(sDate) {
  if (!sDate) return "";
  
  try {
    let oDate;
    
    // Handle SAP timestamp format: "20260217035316.0627900"
    if (typeof sDate === "string" && /^\d{14}(\.\d+)?$/.test(sDate)) {
      const sYear  = sDate.substring(0, 4);
      const sMonth = sDate.substring(4, 6);
      const sDay   = sDate.substring(6, 8);
      oDate = new Date(sYear, sMonth - 1, sDay);
    }
    // Handle OData /Date(timestamp)/ format
    else if (typeof sDate === "string" && sDate.indexOf("/Date(") !== -1) {
      const matches = sDate.match(/\/Date\((\d+)\)\//);
      if (matches && matches[1]) {
        oDate = new Date(parseInt(matches[1], 10));
      }
    }
    // Handle DD-MM-YYYY format (like Cdate: "02-17-2026")
    else if (typeof sDate === "string" && /^\d{2}-\d{2}-\d{4}$/.test(sDate)) {
      const parts = sDate.split("-");
      oDate = new Date(parts[2], parts[0] - 1, parts[1]);
    }
    // Handle numeric timestamp
    else if (typeof sDate === "number") {
      oDate = new Date(sDate);
    }
    // Fallback
    else {
      oDate = new Date(sDate);
    }
    
    if (!oDate || isNaN(oDate.getTime())) return "";
    
    const sDay   = String(oDate.getDate()).padStart(2, '0');
    const sMonth = String(oDate.getMonth() + 1).padStart(2, '0');
    const sYear  = oDate.getFullYear();
    
    return sDay + "/" + sMonth + "/" + sYear;
  } catch (e) {
    return "";
  }
},

    _getStatusState: function(sStatus) {
      if (!sStatus) return "None";
      
      const sStatusLower = sStatus.toLowerCase();
      
      if (sStatusLower.includes("complete") || sStatusLower.includes("approved") || sStatusLower.includes("success")) {
        return "Success";
      } else if (sStatusLower.includes("reject") || sStatusLower.includes("error") || sStatusLower.includes("fail")) {
        return "Error";
      } else if (sStatusLower.includes("pending") || sStatusLower.includes("waiting") || sStatusLower.includes("warning")) {
        return "Warning";
      } else if (sStatusLower.includes("draft") || sStatusLower.includes("new")) {
        return "None";
      }
      
      return "None";
    },

    _calculateKPICounts: function(aData) {
      const oCounts = {
        draft: 0,
        rejected: 0,
        completed: 0,
        pendingApproval: 0
      };

      aData.forEach(item => {
        const sStatus = (item.status || "").toLowerCase();
        
        if (sStatus.includes("draft") || sStatus.includes("new")) {
          oCounts.draft++;
        } else if (sStatus.includes("reject") || sStatus.includes("declined")) {
          oCounts.rejected++;
        } else if (sStatus.includes("complete") || sStatus.includes("approved") || sStatus.includes("done")) {
          oCounts.completed++;
        } else if (sStatus.includes("pending") || sStatus.includes("waiting") || sStatus.includes("review")) {
          oCounts.pendingApproval++;
        }
      });

      return oCounts;
    },

    onRequestPress: function(oEvent) {
      const oItem = oEvent.getSource();
      const oContext = oItem.getBindingContext();
      const oRequest = oContext.getObject();
      
      MessageToast.show("Request: " + oRequest.requestNo);
    },

    onActionsPress: function(oEvent) {
      const oButton = oEvent.getSource();
      const oContext = oButton.getBindingContext();
      const oRequest = oContext.getObject();
      const sStatus = oRequest.status;
      const sInstantId = oRequest.instantId;

      // Create action sheet based on status
      const aButtons = [];
      const sStatusLower = (sStatus || "").toLowerCase();

      // Add buttons based on status
      if (sStatusLower.includes("pending") || sStatusLower.includes("waiting") || sStatusLower.includes("review")) {
        aButtons.push(
          new Button({
            text: "Workflow Logs",
            press: function() {
              this._navigateToPage("WorkflowLogs", sInstantId);
            }.bind(this)
          }),
          new Button({
            text: "View Details",
            press: function() {
              this._navigateToPage("ViewDetails", sInstantId);
            }.bind(this)
          }),
          new Button({
  text: "Recall",
  press: function() {
    this._triggerIntegrationFlow(sInstantId);
  }.bind(this)
})
        );
      } else if (sStatusLower.includes("draft") || sStatusLower.includes("new")) {
        aButtons.push(
          new Button({
            text: "Edit",
            press: function() {
              this._navigateToPage("Draft", sInstantId);
            }.bind(this)
          }),
          new Button({
            text: "Workflow Logs",
            press: function() {
              this._navigateToPage("WorkflowLogs", sInstantId);
            }.bind(this)
          }),
          new Button({
            text: "View Details",
            press: function() {
              this._navigateToPage("ViewDetails", sInstantId);
            }.bind(this)
          })
        );
      } else if (sStatusLower.includes("complete") || sStatusLower.includes("approved") || sStatusLower.includes("done")) {
        aButtons.push(
          new Button({
            text: "Workflow Logs",
            press: function() {
              this._navigateToPage("WorkflowLogs", sInstantId);
            }.bind(this)
          }),
          new Button({
            text: "View Details",
            press: function() {
              this._navigateToPage("ViewDetails", sInstantId);
            }.bind(this)
          }),
            new Button({
            text: "Copy",
            press: function() {
              this._navigateToPage("Copy", sInstantId);
            }.bind(this)
          }),
        );
      } else if (sStatusLower.includes("reject") || sStatusLower.includes("declined")) {
        aButtons.push(
          new Button({
            text: "Edit",
            press: function() {
              this._navigateToPage("Draft", sInstantId);
            }.bind(this)
          }),
          new Button({
            text: "Workflow Logs",
            press: function() {
              this._navigateToPage("WorkflowLogs", sInstantId);
            }.bind(this)
          }),
          new Button({
            text: "View Details",
            press: function() {
              this._navigateToPage("ViewDetails", sInstantId);
            }.bind(this)
          })
        );
      } else {
        aButtons.push(
          new Button({
            text: "View Details",
            press: function() {
              this._navigateToPage("ViewDetails", sInstantId);
            }.bind(this)
          })
        );
      }

      // Create and open action sheet
      if (!this._actionSheet) {
        this._actionSheet = new ActionSheet({
          buttons: aButtons,
          placement: "Bottom"
        });
        this.getView().addDependent(this._actionSheet);
      } else {
        this._actionSheet.removeAllButtons();
        aButtons.forEach(function(oBtn) {
          this._actionSheet.addButton(oBtn);
        }.bind(this));
      }

      this._actionSheet.openBy(oButton);
    },

    _navigateToPage: function(sRouteName, sInstantId) {
      if (this._actionSheet) {
        this._actionSheet.close();
      }

      const oRouter = this.getOwnerComponent().getRouter();
      oRouter.navTo(sRouteName, {
        instantId: sInstantId
      });
      
      MessageToast.show("Navigating to " + sRouteName + " with ID: " + sInstantId);
    },

_triggerIntegrationFlow: function(sInstantId) {

  if (this._actionSheet) {
    this._actionSheet.close();
  }

  MessageBox.confirm(
    "Are you sure you want to recall the request for Instance ID: " + sInstantId + "?",
    {
      title: "Confirm Recall",
      onClose: function(sAction) {

        if (sAction === MessageBox.Action.OK) {

          this.getView().setBusy(true);

          WorkflowAPI.recallWorkflowInstance(sInstantId)

          .then(() => {

            this.getView().setBusy(false);

            MessageToast.show(
              "Request recalled successfully for: " + sInstantId
            );

          })

          .catch(error => {

            this.getView().setBusy(false);

            MessageBox.error(
              "Failed to recall request.\n\nError: " + error.message
            );

          });

        }

      }.bind(this)
    }
  );

},

    onSearch: function(oEvent) {
      const sQuery = oEvent.getParameter("query") || oEvent.getParameter("newValue") || "";
      const oTable = this.byId("requestsTable");
      const oBinding = oTable.getBinding("items");
      
      if (!oBinding) {
        return;
      }

      const aFilters = [];

      if (sQuery && sQuery.length > 0) {
        const aSearchFilters = [
          new Filter("requestNo", FilterOperator.Contains, sQuery),
          new Filter("documentNo", FilterOperator.Contains, sQuery),
          new Filter("affiliate", FilterOperator.Contains, sQuery),
          new Filter("nameAccrual", FilterOperator.Contains, sQuery),
          new Filter("companyCode", FilterOperator.Contains, sQuery),
          new Filter("requestedBy", FilterOperator.Contains, sQuery),
          new Filter("approvedBy", FilterOperator.Contains, sQuery),
          new Filter("requestType", FilterOperator.Contains, sQuery),
          new Filter("typeOfParty", FilterOperator.Contains, sQuery),
          new Filter("status", FilterOperator.Contains, sQuery),
          new Filter("dateCreated", FilterOperator.Contains, sQuery),
          new Filter("lastUpdated", FilterOperator.Contains, sQuery)
        ];
        
        aFilters.push(new Filter({
          filters: aSearchFilters,
          and: false
        }));
      }

      this._applyFiltersWithSearch(aFilters);
    },

    onStatusFilterChange: function(oEvent) {
      this._applyFilters();
    },

    onRequestTypeFilterChange: function(oEvent) {
      this._applyFilters();
    },

    onPartyTypeFilterChange: function(oEvent) {
      this._applyFilters();
    },

    _applyFilters: function() {
      const aFilters = [];
      
      const sStatusKey = this.byId("statusFilter").getSelectedKey();
      if (sStatusKey && sStatusKey !== "All") {
        aFilters.push(new Filter("status", FilterOperator.Contains, sStatusKey));
      }

      const sRequestTypeKey = this.byId("requestTypeFilter").getSelectedKey();
      if (sRequestTypeKey && sRequestTypeKey !== "All") {
        aFilters.push(new Filter("requestType", FilterOperator.Contains, sRequestTypeKey));
      }

      const sPartyTypeKey = this.byId("partyTypeFilter").getSelectedKey();
      if (sPartyTypeKey && sPartyTypeKey !== "All") {
        aFilters.push(new Filter("typeOfParty", FilterOperator.Contains, sPartyTypeKey));
      }

      const oSearchField = this.byId("searchField");
      const sSearchQuery = oSearchField.getValue();
      
      if (sSearchQuery && sSearchQuery.length > 0) {
        const aSearchFilters = [
          new Filter("requestNo", FilterOperator.Contains, sSearchQuery),
          new Filter("documentNo", FilterOperator.Contains, sSearchQuery),
          new Filter("affiliate", FilterOperator.Contains, sSearchQuery),
          new Filter("nameAccrual", FilterOperator.Contains, sSearchQuery),
          new Filter("companyCode", FilterOperator.Contains, sSearchQuery),
          new Filter("requestedBy", FilterOperator.Contains, sSearchQuery),
          new Filter("approvedBy", FilterOperator.Contains, sSearchQuery),
          new Filter("requestType", FilterOperator.Contains, sSearchQuery),
          new Filter("typeOfParty", FilterOperator.Contains, sSearchQuery),
          new Filter("status", FilterOperator.Contains, sSearchQuery),
          new Filter("dateCreated", FilterOperator.Contains, sSearchQuery),
          new Filter("lastUpdated", FilterOperator.Contains, sSearchQuery)
        ];
        
        aFilters.push(new Filter({
          filters: aSearchFilters,
          and: false
        }));
      }

      const oTable = this.byId("requestsTable");
      const oBinding = oTable.getBinding("items");
      
      if (oBinding) {
        oBinding.filter(aFilters);
      }
    },

    _applyFiltersWithSearch: function(aSearchFilters) {
      const aFilters = [];
      
      if (aSearchFilters && aSearchFilters.length > 0) {
        aFilters.push(aSearchFilters[0]);
      }
      
      const sStatusKey = this.byId("statusFilter").getSelectedKey();
      if (sStatusKey && sStatusKey !== "All") {
        aFilters.push(new Filter("status", FilterOperator.Contains, sStatusKey));
      }

      const sRequestTypeKey = this.byId("requestTypeFilter").getSelectedKey();
      if (sRequestTypeKey && sRequestTypeKey !== "All") {
        aFilters.push(new Filter("requestType", FilterOperator.Contains, sRequestTypeKey));
      }

      const sPartyTypeKey = this.byId("partyTypeFilter").getSelectedKey();
      if (sPartyTypeKey && sPartyTypeKey !== "All") {
        aFilters.push(new Filter("typeOfParty", FilterOperator.Contains, sPartyTypeKey));
      }

      const oTable = this.byId("requestsTable");
      const oBinding = oTable.getBinding("items");
      
      if (oBinding) {
        oBinding.filter(aFilters);
      }
    },

    onKPIPress: function(oEvent) {
      const sTileId = oEvent.getSource().getId();
      let sStatusFilter = "";

      if (sTileId.includes("TotalRequest")) {
        // Clear all filters to show all requests
        const oSearchField = this.byId("searchField");
        oSearchField.setValue("");
        
        this.byId("statusFilter").setSelectedKey("All");
        this.byId("requestTypeFilter").setSelectedKey("All");
        this.byId("partyTypeFilter").setSelectedKey("All");
        
        const oTable = this.byId("requestsTable");
        const oBinding = oTable.getBinding("items");
        
        if (oBinding) {
          oBinding.filter([]);
        }
        return;
      }

      if (sTileId.includes("draft")) {
        sStatusFilter = "draft";
      } else if (sTileId.includes("rejected")) {
        sStatusFilter = "reject";
      } else if (sTileId.includes("completed")) {
        sStatusFilter = "complete";
      } else if (sTileId.includes("pendingApproval")) {
        sStatusFilter = "pending";
      }

      if (sStatusFilter) {
        const oSearchField = this.byId("searchField");
        oSearchField.setValue("");
        
        const oStatusFilter = this.byId("statusFilter");
        oStatusFilter.setSelectedKey("All");
        
        this.byId("requestTypeFilter").setSelectedKey("All");
        this.byId("partyTypeFilter").setSelectedKey("All");
        
        const aFilters = [new Filter("status", FilterOperator.Contains, sStatusFilter)];
        const oTable = this.byId("requestsTable");
        const oBinding = oTable.getBinding("items");
        
        if (oBinding) {
          oBinding.filter(aFilters);
        }
      }
    }
  });
});