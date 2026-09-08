import { forwardRef, type ForwardRefExoticComponent, type RefAttributes } from "react";
import {
  HugeiconsIcon,
  type HugeiconsIconProps,
  type IconSvgElement,
} from "@hugeicons/react";
import AlertCircleData from "@hugeicons/core-free-icons/AlertCircleIcon";
import Alert02Data from "@hugeicons/core-free-icons/Alert02Icon";
import Archive02Data from "@hugeicons/core-free-icons/Archive02Icon";
import ArrowDownToLineData from "@hugeicons/core-free-icons/ArrowDownToLineIcon";
import ArrowLeft02Data from "@hugeicons/core-free-icons/ArrowLeft02Icon";
import ArrowRight02Data from "@hugeicons/core-free-icons/ArrowRight02Icon";
import ArrowUpRight01Data from "@hugeicons/core-free-icons/ArrowUpRight01Icon";
import BanknoteData from "@hugeicons/core-free-icons/BanknoteIcon";
import Building02Data from "@hugeicons/core-free-icons/Building02Icon";
import Calendar03Data from "@hugeicons/core-free-icons/Calendar03Icon";
import CalendarClockData from "@hugeicons/core-free-icons/CalendarClockIcon";
import Cancel01Data from "@hugeicons/core-free-icons/Cancel01Icon";
import ChartNoAxesCombinedData from "@hugeicons/core-free-icons/ChartNoAxesCombinedIcon";
import CheckmarkCircle02Data from "@hugeicons/core-free-icons/CheckmarkCircle02Icon";
import ChevronDownData from "@hugeicons/core-free-icons/ChevronDownIcon";
import ChevronLeftData from "@hugeicons/core-free-icons/ChevronLeftIcon";
import ChevronRightData from "@hugeicons/core-free-icons/ChevronRightIcon";
import ChevronUpData from "@hugeicons/core-free-icons/ChevronUpIcon";
import CircleDollarSignData from "@hugeicons/core-free-icons/CircleDollarSignIcon";
import ComputerData from "@hugeicons/core-free-icons/ComputerIcon";
import Delete02Data from "@hugeicons/core-free-icons/Delete02Icon";
import Download01Data from "@hugeicons/core-free-icons/Download01Icon";
import Edit02Data from "@hugeicons/core-free-icons/Edit02Icon";
import ExternalLinkData from "@hugeicons/core-free-icons/ExternalLinkIcon";
import EyeData from "@hugeicons/core-free-icons/EyeIcon";
import EyeOffData from "@hugeicons/core-free-icons/EyeOffIcon";
import FileAddData from "@hugeicons/core-free-icons/FileAddIcon";
import FileClockData from "@hugeicons/core-free-icons/FileClockIcon";
import FileImageData from "@hugeicons/core-free-icons/FileImageIcon";
import FloppyDiskData from "@hugeicons/core-free-icons/FloppyDiskIcon";
import Home01Data from "@hugeicons/core-free-icons/Home01Icon";
import ImageAdd01Data from "@hugeicons/core-free-icons/ImageAdd01Icon";
import Invoice02Data from "@hugeicons/core-free-icons/Invoice02Icon";
import Key01Data from "@hugeicons/core-free-icons/Key01Icon";
import Loading03Data from "@hugeicons/core-free-icons/Loading03Icon";
import Location01Data from "@hugeicons/core-free-icons/Location01Icon";
import Mail01Data from "@hugeicons/core-free-icons/Mail01Icon";
import Moon01Data from "@hugeicons/core-free-icons/Moon01Icon";
import PackageData from "@hugeicons/core-free-icons/PackageIcon";
import PackageAddData from "@hugeicons/core-free-icons/PackageAddIcon";
import PauseData from "@hugeicons/core-free-icons/PauseIcon";
import PlayData from "@hugeicons/core-free-icons/PlayIcon";
import PlusSignData from "@hugeicons/core-free-icons/PlusSignIcon";
import ReceiptTextData from "@hugeicons/core-free-icons/ReceiptTextIcon";
import RefreshData from "@hugeicons/core-free-icons/RefreshIcon";
import Search01Data from "@hugeicons/core-free-icons/Search01Icon";
import SentData from "@hugeicons/core-free-icons/SentIcon";
import Settings01Data from "@hugeicons/core-free-icons/Settings01Icon";
import SlidersHorizontalData from "@hugeicons/core-free-icons/SlidersHorizontalIcon";
import Tick02Data from "@hugeicons/core-free-icons/Tick02Icon";
import UndoData from "@hugeicons/core-free-icons/UndoIcon";
import Upload01Data from "@hugeicons/core-free-icons/Upload01Icon";
import UserAdd01Data from "@hugeicons/core-free-icons/UserAdd01Icon";
import UserMultiple02Data from "@hugeicons/core-free-icons/UserMultiple02Icon";
import DashboardSquare01Data from "@hugeicons/core-free-icons/DashboardSquare01Icon";

type IconProps = Omit<HugeiconsIconProps, "altIcon" | "icon">;
type Icon = ForwardRefExoticComponent<
  IconProps & RefAttributes<SVGSVGElement>
>;
export type LucideIcon = Icon;

function createIcon(icon: IconSvgElement, displayName: string): Icon {
  const Component = forwardRef<SVGSVGElement, IconProps>((props, ref) => (
    <HugeiconsIcon icon={icon} ref={ref} {...props} />
  ));
  Component.displayName = displayName;
  return Component;
}

export const AlertCircleIcon = createIcon(AlertCircleData, "AlertCircleIcon");
export const Archive = createIcon(Archive02Data, "Archive");
export const ArchiveIcon = Archive;
export const ArrowDownToLine = createIcon(ArrowDownToLineData, "ArrowDownToLine");
export const ArrowLeft = createIcon(ArrowLeft02Data, "ArrowLeft");
export const ArrowRightIcon = createIcon(ArrowRight02Data, "ArrowRightIcon");
export const ArrowUpRight = createIcon(ArrowUpRight01Data, "ArrowUpRight");
export const Banknote = createIcon(BanknoteData, "Banknote");
export const Building2Icon = createIcon(Building02Data, "Building2Icon");
export const CalendarClock = createIcon(CalendarClockData, "CalendarClock");
export const CalendarDaysIcon = createIcon(Calendar03Data, "CalendarDaysIcon");
export const CalendarRange = CalendarDaysIcon;
export const ChartNoAxesCombined = createIcon(
  ChartNoAxesCombinedData,
  "ChartNoAxesCombined",
);
export const Check = createIcon(Tick02Data, "Check");
export const CheckIcon = Check;
export const CheckCircle2 = createIcon(CheckmarkCircle02Data, "CheckCircle2");
export const CheckCircle2Icon = CheckCircle2;
export const ChevronDown = createIcon(ChevronDownData, "ChevronDown");
export const ChevronDownIcon = ChevronDown;
export const ChevronLeft = createIcon(ChevronLeftData, "ChevronLeft");
export const ChevronLeftIcon = ChevronLeft;
export const ChevronRight = createIcon(ChevronRightData, "ChevronRight");
export const ChevronRightIcon = ChevronRight;
export const ChevronUpIcon = createIcon(ChevronUpData, "ChevronUpIcon");
export const CircleDollarSign = createIcon(
  CircleDollarSignData,
  "CircleDollarSign",
);
export const Download = createIcon(Download01Data, "Download");
export const ExternalLink = createIcon(ExternalLinkData, "ExternalLink");
export const EyeIcon = createIcon(EyeData, "EyeIcon");
export const EyeOffIcon = createIcon(EyeOffData, "EyeOffIcon");
export const FileClock = createIcon(FileClockData, "FileClock");
export const FileImage = createIcon(FileImageData, "FileImage");
export const FilePlus2 = createIcon(FileAddData, "FilePlus2");
export const FileText = createIcon(Invoice02Data, "FileText");
export const FileTextIcon = FileText;
export const FullMoon = createIcon(Moon01Data, "FullMoon");
export const House = createIcon(Home01Data, "House");
export const ImagePlus = createIcon(ImageAdd01Data, "ImagePlus");
export const KeyRoundIcon = createIcon(Key01Data, "KeyRoundIcon");
export const LayoutDashboard = createIcon(
  DashboardSquare01Data,
  "LayoutDashboard",
);
export const LoaderCircle = createIcon(Loading03Data, "LoaderCircle");
export const LoaderCircleIcon = LoaderCircle;
export const Mail = createIcon(Mail01Data, "Mail");
export const MapPin = createIcon(Location01Data, "MapPin");
export const MapPinIcon = MapPin;
export const Monitor = createIcon(ComputerData, "Monitor");
export const Package = createIcon(PackageData, "Package");
export const Package2 = Package;
export const PackageIcon = Package;
export const PackagePlus = createIcon(PackageAddData, "PackagePlus");
export const Pause = createIcon(PauseData, "Pause");
export const Pencil = createIcon(Edit02Data, "Pencil");
export const PencilIcon = Pencil;
export const Play = createIcon(PlayData, "Play");
export const Plus = createIcon(PlusSignData, "Plus");
export const PlusIcon = Plus;
export const Receipt = createIcon(ReceiptTextData, "Receipt");
export const ReceiptText = Receipt;
export const RefreshCw = createIcon(RefreshData, "RefreshCw");
export const RotateCcw = createIcon(UndoData, "RotateCcw");
export const RotateCcwIcon = RotateCcw;
export const SaveIcon = createIcon(FloppyDiskData, "SaveIcon");
export const Search = createIcon(Search01Data, "Search");
export const SearchIcon = Search;
export const Send = createIcon(SentData, "Send");
export const Settings = createIcon(Settings01Data, "Settings");
export const SlidersHorizontalIcon = createIcon(
  SlidersHorizontalData,
  "SlidersHorizontalIcon",
);
export const Trash2 = createIcon(Delete02Data, "Trash2");
export const TriangleAlert = createIcon(Alert02Data, "TriangleAlert");
export const Upload = createIcon(Upload01Data, "Upload");
export const UserPlus = createIcon(UserAdd01Data, "UserPlus");
export const Users = createIcon(UserMultiple02Data, "Users");
export const XIcon = createIcon(Cancel01Data, "XIcon");
