
import { useData } from '../store/DataContext';
import { getClassQuarterTotal, getClassSemesterTotal, getClassYearTotal } from '../utils/calculations';

const SemesterSummary = () => {
  const { state } = useData();

  if (!state.currentClassId) {
    return (
      <div className="p-8 text-center text-gray-500">
        Please select a Class from the header to view the semester summary.
      </div>
    );
  }

  const currentClass = state.classes.find(c => c.id === state.currentClassId);
  const q1 = getClassQuarterTotal(state.records, state.currentClassId, 1);
  const q2 = getClassQuarterTotal(state.records, state.currentClassId, 2);
  const q3 = getClassQuarterTotal(state.records, state.currentClassId, 3);
  const q4 = getClassQuarterTotal(state.records, state.currentClassId, 4);

  const sem1 = getClassSemesterTotal(state.records, state.currentClassId, 1);
  const sem2 = getClassSemesterTotal(state.records, state.currentClassId, 2);
  const yearTotal = getClassYearTotal(state.records, state.currentClassId);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">
        {currentClass?.name} — Academic Year Summary
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="bg-blue-600 text-white p-4">
            <h3 className="text-lg font-bold">Semester 1</h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-gray-600">Quarter 1 Total</span>
              <span className="font-bold text-xl">{q1}</span>
            </div>
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-gray-600">Quarter 2 Total</span>
              <span className="font-bold text-xl">{q2}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-gray-900 font-bold">Semester 1 Total</span>
              <span className="font-bold text-2xl text-blue-600">{sem1}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
          <div className="bg-green-600 text-white p-4">
            <h3 className="text-lg font-bold">Semester 2</h3>
          </div>
          <div className="p-6 space-y-4">
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-gray-600">Quarter 3 Total</span>
              <span className="font-bold text-xl">{q3}</span>
            </div>
            <div className="flex justify-between items-center border-b pb-2">
              <span className="text-gray-600">Quarter 4 Total</span>
              <span className="font-bold text-xl">{q4}</span>
            </div>
            <div className="flex justify-between items-center pt-2">
              <span className="text-gray-900 font-bold">Semester 2 Total</span>
              <span className="font-bold text-2xl text-green-600">{sem2}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-gray-800 text-white p-6 rounded-lg shadow-sm flex justify-between items-center">
        <div>
          <h3 className="text-xl font-bold">Total Academic Year Participation</h3>
          <p className="text-gray-400">Sum of all quarters for {currentClass?.name}</p>
        </div>
        <div className="text-5xl font-black">
          {yearTotal}
        </div>
      </div>
    </div>
  );
};

export default SemesterSummary;
