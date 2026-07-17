import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Users2, GitBranch } from 'lucide-react';
import EmployeesTab from '@/components/EmployeesTab';
import TeamsSection from '@/components/TeamsSection';
import OrgChart from '@/components/employees/OrgChart';

const Employees = () => {
  return (
    <div>
      <Tabs defaultValue="list">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-foreground">People</h1>
          <TabsList>
            <TabsTrigger value="list" className="gap-1.5">
              <Users className="h-4 w-4" /> List
            </TabsTrigger>
            <TabsTrigger value="orgchart" className="gap-1.5">
              <GitBranch className="h-4 w-4" /> Org Chart
            </TabsTrigger>
            <TabsTrigger value="teams" className="gap-1.5">
              <Users2 className="h-4 w-4" /> Teams
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="list"><EmployeesTab /></TabsContent>
        <TabsContent value="orgchart"><OrgChart /></TabsContent>
        <TabsContent value="teams"><TeamsSection /></TabsContent>
      </Tabs>
    </div>
  );
};

export default Employees;
