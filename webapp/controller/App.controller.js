sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/ui/core/UIComponent"
], function (Controller, UIComponent) {
  "use strict";

  return Controller.extend("accrual.controller.App", {

    onInit: function() {
      // Initialize sidebar state
      this._isSideNavExpanded = true;
    },

    onNavPress: function (oEvent) {
      const sKey = oEvent.getSource().getKey();
      const oRouter = UIComponent.getRouterFor(this);

      if (sKey === "dashboard") {
        oRouter.navTo("Dashboard");
      } else if (sKey === "request") {
        oRouter.navTo("RequestPage");
      }
    },

    onToggleSideNavigation: function() {
      const oSideNavigation = this.byId("sideNavigation");
      const oToolPage = this.byId("toolPage");
      
      // Toggle the expanded state
      this._isSideNavExpanded = !this._isSideNavExpanded;
      
      // Set the expanded property of SideNavigation
      oSideNavigation.setExpanded(this._isSideNavExpanded);
      
      // Toggle the side content visibility on ToolPage
      oToolPage.setSideExpanded(this._isSideNavExpanded);
    }

  });
});