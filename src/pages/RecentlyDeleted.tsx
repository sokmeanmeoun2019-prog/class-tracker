import { useData } from '../store/DataContext';
import { RefreshCcw, Trash2, AlertCircle } from 'lucide-react';
import { differenceInDays } from 'date-fns';

const RecentlyDeleted = () => {
  const { state, dispatch } = useData();
  const trashItems = state.trash || [];

  const handleRestore = (id: string) => {
    dispatch({ type: 'RESTORE_TRASH_ITEM', payload: id });
  };

  const handlePermanentDelete = (id: string) => {
    if (window.confirm("Are you sure you want to permanently delete this? It cannot be recovered.")) {
      dispatch({ type: 'DELETE_TRASH_ITEM', payload: id });
    }
  };

  const handleEmptyTrash = () => {
    if (window.confirm("Are you sure you want to permanently delete ALL items in the trash? This cannot be undone.")) {
      dispatch({ type: 'EMPTY_TRASH' });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Recently Deleted</h2>
          <p className="text-gray-500 text-sm mt-1">
            Items here will be permanently deleted after 30 days.
          </p>
        </div>
        {trashItems.length > 0 && (
          <button 
            onClick={handleEmptyTrash}
            className="flex items-center gap-2 text-red-600 hover:text-red-700 bg-red-50 px-4 py-2 rounded-md font-medium"
          >
            <Trash2 size={18} /> Empty Trash
          </button>
        )}
      </div>

      <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
        {trashItems.length === 0 ? (
          <div className="p-12 text-center flex flex-col items-center justify-center text-gray-500">
            <Trash2 size={48} className="text-gray-300 mb-4" />
            <h3 className="text-lg font-medium text-gray-700 mb-1">Trash is Empty</h3>
            <p>No recently deleted items to display.</p>
          </div>
        ) : (
          <ul className="divide-y">
            {trashItems.map((item) => {
              const daysLeft = 30 - differenceInDays(new Date(), new Date(item.deletedAt));
              return (
                <li key={item.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-gray-50">
                  <div>
                    <h3 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                      {item.name}
                    </h3>
                    <div className="text-sm text-gray-500 mt-1 space-y-1">
                      <p>Type: <span className="font-semibold">{item.type}</span></p>
                      <p>
                        Contains: {item.payload.year ? '1 Year, ' : ''} 
                        {item.payload.classes ? `${item.payload.classes.length} Classes, ` : ''} 
                        {item.payload.students ? `${item.payload.students.length} Students, ` : ''} 
                        {item.payload.records ? `${item.payload.records.length} Records` : ''}
                      </p>
                      <p className="text-red-500 flex items-center gap-1 mt-1">
                        <AlertCircle size={14} /> 
                        Permanently deleting in {daysLeft} {daysLeft === 1 ? 'day' : 'days'}
                      </p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button 
                      onClick={() => handleRestore(item.id)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2 rounded font-medium"
                    >
                      <RefreshCcw size={16} /> Recover
                    </button>
                    <button 
                      onClick={() => handlePermanentDelete(item.id)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-red-600 px-4 py-2 rounded font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default RecentlyDeleted;
