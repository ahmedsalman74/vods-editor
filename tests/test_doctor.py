import contextlib
import io
from types import SimpleNamespace
import unittest
from unittest.mock import AsyncMock, call
from test_setup import module
doctor=module('doctor')

class DoctorTests(unittest.IsolatedAsyncioTestCase):
    async def test_live_check_calls_only_read_only_tools(self):
        session=SimpleNamespace(initialize=AsyncMock(),list_tools=AsyncMock(return_value=SimpleNamespace(tools=[1])),call_tool=AsyncMock(side_effect=[SimpleNamespace(isError=False,structuredContent={'alive':True}),SimpleNamespace(isError=False,structuredContent={'project':'test'}),SimpleNamespace(isError=False,structuredContent={'timelines':[]})]))
        with contextlib.redirect_stdout(io.StringIO()):code=await doctor.inspect_session(session)
        self.assertEqual(code,0)
        self.assertEqual(session.call_tool.call_args_list,[call('resolve_status',{}),call('get_project_info',{}),call('list_timelines',{})])
    async def test_offline_is_nonzero_without_project_queries(self):
        session=SimpleNamespace(initialize=AsyncMock(),list_tools=AsyncMock(return_value=SimpleNamespace(tools=[])),call_tool=AsyncMock(return_value=SimpleNamespace(isError=False,structuredContent={'alive':False})))
        with contextlib.redirect_stdout(io.StringIO()):code=await doctor.inspect_session(session)
        self.assertEqual(code,1);session.call_tool.assert_called_once_with('resolve_status',{})
